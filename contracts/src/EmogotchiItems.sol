// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {SSTORE2} from "./EmogotchiArt.sol";
import {Base64, INadRouter, INadLens, IERC20Balance} from "./Emogotchi.sol";
import {IGate} from "./gates/IGate.sol";

interface IERC1155Receiver {
    function onERC1155Received(address operator, address from, uint256 id, uint256 value, bytes calldata data)
        external
        returns (bytes4);
    function onERC1155BatchReceived(
        address operator,
        address from,
        uint256[] calldata ids,
        uint256[] calldata values,
        bytes calldata data
    ) external returns (bytes4);
}

interface IOwnerOf {
    function ownerOf(uint256 id) external view returns (address);
}

/// @notice What a mechanics contract implements to be handed a spent item by `use`: the holder burns
///         the copies and the sink is told, in the same transaction, with no operator approval involved.
interface IItemSink {
    function onItemUsed(address from, uint256 id, uint256 qty, bytes calldata data) external returns (bytes4);
}

/**
 * @title  EmogotchiItems
 * @notice The item shop: costumes, accessories, room themes, tools. One ERC-1155, many item types, added
 *         forever by a curator and never changed once added.
 *
 *         The promise that makes an admin key acceptable here: **append-only**. A new item can be created
 *         at any time. An existing item's rules (price, supply, per-wallet cap, window, gate, kind, art)
 *         can never be changed. The curator can end an item's claim early (`seal`, one way) and can grant
 *         copies within the item's max supply, so scarcity holds. The curator can hand the role on or
 *         renounce it, which freezes the shop forever. This contract cannot touch a cat.
 *
 *         Claim rules are pluggable: each item may point at a gate contract with one question,
 *         `eligible(who, data)`. "Named your cat", "holds two cats", an allowlist: small separate
 *         contracts, frozen per item, none of them touching this one. A gate also says what the
 *         per-claimer cap counts: the wallet by default, or the thing that qualified (NamedCatGate
 *         keys on the cat), so a scarce item cannot be drained by walking one cat through fresh wallets.
 *
 *         Equipping is pet-agnostic. Any registered collection's tokens can equip items; a pet carries a
 *         set of equipped items per owner, so an outfit, a room theme and a companion can all be on at
 *         once. An equipped item only counts while the pet's current owner still holds it: sell the item
 *         and every pet wearing it is undressed on the next read, with no cleanup transaction; sell the
 *         pet and its new owner starts with nothing on.
 *
 *         Paid items feed the same flywheel as the game: 80% queued to buy and burn EMO through nad.fun
 *         under the same impact guard, 10% treasury, 10% team. Royalties on resale go to the treasury.
 *         Metadata is built on chain; each item's image is SVG stored with SSTORE2.
 */
contract EmogotchiItems {
    // ---------------------------------------------------------------- types
    enum Kind {
        None,
        Cosmetic, // on the pet: costume, accessory
        Scene, // the room: background, floor, lighting, a bat
        Passive, // held: a ticket for something the site or another contract does
        Consumable // burned on use
    }

    struct Item {
        uint128 price; // wei per copy; 0 = free
        uint32 maxSupply; // 0 = unlimited
        uint32 perKey; // claims per key; the key is the wallet unless the gate keys on something else; 0 = unlimited
        uint64 minted; // 64-bit: a 32-bit counter could be exhausted by one huge claim of an unlimited item
        uint64 opens; // unix; 0 = at once
        uint64 closes; // unix; 0 = never
        Kind kind;
        uint8 slot; // a hint for the site (1 outfit, 2 head, 3 background ...); not enforced on chain
        bool soulbound;
        bool isSealed;
        address gate; // IGate, or 0 for anyone
        address art; // SSTORE2 pointer to the SVG
        string name;
        string description;
    }

    struct CreateParams {
        string name;
        string description;
        bytes svg;
        uint128 price;
        uint32 maxSupply;
        uint32 perKey;
        uint64 opens;
        uint64 closes;
        Kind kind;
        uint8 slot;
        bool soulbound;
        address gate;
    }

    // ---------------------------------------------------------------- constants and immutables
    uint256 public constant BPS = 10_000;
    uint256 public constant ROYALTY_BPS = 500;
    uint256 public constant MAX_EQUIPPED = 16;
    uint256 public constant FALLBACK_DELAY = 7 days;
    address public constant BURN_ADDRESS = 0x000000000000000000000000000000000000dEaD;

    address public immutable TREASURY;
    address public immutable TEAM;
    uint256 public immutable TREASURY_BPS;
    uint256 public immutable TEAM_BPS;
    address public immutable EMO;
    address public immutable WMON;
    INadRouter public immutable ROUTER;
    INadLens public immutable LENS;
    address public immutable POOL;
    uint256 public immutable MAX_IMPACT_BPS;
    address public immutable COLLECTION_ART; // SSTORE2 pointer, the collection's own picture

    // ---------------------------------------------------------------- state
    address public curator;
    address public pendingCurator; // two-step handover: a typo cannot freeze the shop
    uint256 public itemCount;
    mapping(uint256 => Item) internal _items;
    mapping(uint256 => mapping(bytes32 => uint64)) public claimedBy; // item => key (wallet or what the gate keys on)
    mapping(uint256 => uint256) public burned; // copies consumed or used, per item
    mapping(address => bool) public collectionAllowed;

    mapping(uint256 => mapping(address => uint256)) private _balances;
    mapping(address => mapping(address => bool)) private _operators;

    mapping(bytes32 => uint256[]) private _equipped; // keyed by (collection, tokenId, owner)
    mapping(bytes32 => mapping(uint256 => uint256)) private _equippedAt; // 1-based index into _equipped

    uint256 public pendingBurnMon;
    uint128 public treasuryOwed;
    uint128 public teamOwed;
    uint256 public totalMonBurned;
    uint256 public totalEmoBurned;
    uint256 public brokenSince; // when `swapPathBroken()` was first noted true, 0 while the path works
    uint256 public lastBurnBlock; // one burn per block, so the impact guard bounds volume per block too

    uint256 private _lock = 1;

    // ---------------------------------------------------------------- events
    event TransferSingle(address indexed operator, address indexed from, address indexed to, uint256 id, uint256 value);
    event TransferBatch(
        address indexed operator, address indexed from, address indexed to, uint256[] ids, uint256[] values
    );
    event ApprovalForAll(address indexed account, address indexed operator, bool approved);
    event URI(string value, uint256 indexed id);

    event ItemCreated(
        uint256 indexed id,
        string name,
        Kind kind,
        uint256 price,
        uint256 maxSupply,
        uint256 perKey,
        uint256 opens,
        uint256 closes,
        uint8 slot,
        bool soulbound,
        address gate,
        address art
    );
    event Claimed(uint256 indexed id, address indexed to, uint256 qty, uint256 paid);
    event Granted(uint256 indexed id, address indexed to, uint256 qty);
    event Sealed(uint256 indexed id, uint256 finalSupply);
    event CollectionAllowed(address indexed collection, bool allowed);
    event Equipped(address indexed collection, uint256 indexed tokenId, uint256 indexed itemId, address owner);
    event Unequipped(address indexed collection, uint256 indexed tokenId, uint256 indexed itemId, address owner);
    event Consumed(address indexed from, uint256 indexed id, uint256 qty);
    event Used(address indexed from, uint256 indexed id, uint256 qty, address indexed target);
    event Burn(uint256 monIn, uint256 emoOut);
    event BurnQueued(uint256 monIn, uint256 pending);
    event Swept(uint256 treasury, uint256 team);
    event SwapPathNoted(bool broken, uint256 since);
    event CuratorChanged(address indexed from, address indexed to);
    event CuratorProposed(address indexed from, address indexed to);

    // ---------------------------------------------------------------- errors
    error NotCurator();
    error NoItem();
    error BadParams();
    error IsSealed();
    error NotOpenYet();
    error Closed();
    error SoldOut();
    error CapReached();
    error NotEligible();
    error WrongValue(uint256 expected, uint256 sent);
    error NotOwner();
    error NotHolder();
    error NotEquippable();
    error CollectionNotAllowed();
    error TooManyEquipped();
    error NotEquipped();
    error Soulbound();
    error NotApproved();
    error Insufficient();
    error BadReceiver();
    error LengthMismatch();
    error NothingToDo();
    error Reentrancy();
    error ZeroAddress();
    error FallbackNotReady();
    error BadSink();

    // ---------------------------------------------------------------- modifiers
    modifier onlyCurator() {
        if (msg.sender != curator) revert NotCurator();
        _;
    }

    modifier nonReentrant() {
        if (_lock != 1) revert Reentrancy();
        _lock = 2;
        _;
        _lock = 1;
    }

    // ---------------------------------------------------------------- construction
    struct Params {
        address curator;
        address treasury;
        address team;
        uint256 treasuryBps;
        uint256 teamBps;
        address emo;
        address wmon;
        address router;
        address lens;
        address pool;
        uint256 maxImpactBps;
        bytes collectionSvg;
    }

    constructor(Params memory p) {
        if (
            p.curator == address(0) || p.treasury == address(0) || p.team == address(0) || p.emo == address(0)
                || p.wmon == address(0) || p.router == address(0) || p.lens == address(0) || p.pool == address(0)
        ) revert ZeroAddress();
        if (p.treasuryBps + p.teamBps >= BPS || p.maxImpactBps == 0 || p.maxImpactBps > BPS) revert BadParams();
        curator = p.curator;
        TREASURY = p.treasury;
        TEAM = p.team;
        TREASURY_BPS = p.treasuryBps;
        TEAM_BPS = p.teamBps;
        EMO = p.emo;
        WMON = p.wmon;
        ROUTER = INadRouter(p.router);
        LENS = INadLens(p.lens);
        POOL = p.pool;
        MAX_IMPACT_BPS = p.maxImpactBps;
        COLLECTION_ART = SSTORE2.write(p.collectionSvg);
        emit CuratorChanged(address(0), p.curator);
    }

    // ---------------------------------------------------------------- the curator
    /// @notice Add an item. Its rules and art are fixed from this moment; there is no function that edits them.
    function create(CreateParams calldata c) external onlyCurator returns (uint256 id) {
        if (bytes(c.name).length == 0 || c.svg.length == 0 || c.kind == Kind.None) revert BadParams();
        if (c.closes != 0 && c.closes <= c.opens) revert BadParams();
        if (c.gate != address(0)) {
            if (c.gate.code.length == 0) revert BadParams();
            // a gate that cannot answer would make every claim fail with nothing, for life; so it must
            // answer the empty hint in shape, whatever the answer. Gates must not revert on "".
            (bool answered,,) = _ask(c.gate, msg.sender, "", 2_000_000);
            if (!answered) revert BadParams();
        }
        id = ++itemCount;
        Item storage it = _items[id];
        it.price = c.price;
        it.maxSupply = c.maxSupply;
        it.perKey = c.perKey;
        it.opens = c.opens;
        it.closes = c.closes;
        it.kind = c.kind;
        it.slot = c.slot;
        it.soulbound = c.soulbound;
        it.gate = c.gate;
        it.art = SSTORE2.write(c.svg);
        it.name = c.name;
        it.description = c.description;
        // no URI event: it would base64-encode the whole SVG on chain just to log it, several million
        // gas for nothing, and ERC-1155 makes the event optional. ItemCreated is the signal.
        emit ItemCreated(
            id, c.name, c.kind, c.price, c.maxSupply, c.perKey, c.opens, c.closes, c.slot, c.soulbound, c.gate, it.art
        );
    }

    /// @notice End an item's minting for good, whatever its window said. One way.
    function seal(uint256 id) external onlyCurator {
        Item storage it = _item(id);
        if (it.isSealed) revert IsSealed();
        it.isSealed = true;
        emit Sealed(id, it.minted);
    }

    /// @notice Hand out copies of an item, within its max supply, ignoring price, window, cap and gate.
    ///         For rewards and partners. No receiver check, as with the cats' airdrop: a batch must not
    ///         revert on one contract wallet.
    function grant(uint256 id, address[] calldata to, uint32 qty) external onlyCurator {
        Item storage it = _item(id);
        if (it.isSealed) revert IsSealed();
        if (qty == 0) revert BadParams();
        uint256 total = uint256(qty) * to.length;
        if (it.maxSupply != 0 && it.minted + total > it.maxSupply) revert SoldOut();
        if (it.minted + total > type(uint64).max) revert BadParams();
        it.minted += uint64(total);
        for (uint256 i = 0; i < to.length; i++) {
            if (to[i] == address(0)) revert ZeroAddress();
            _balances[id][to[i]] += qty;
            emit TransferSingle(msg.sender, address(0), to[i], id, qty);
            emit Granted(id, to[i], qty);
        }
    }

    /// @notice Let a pet collection's tokens equip items. Today's cats, tomorrow's whatever. One way:
    ///         taking a collection back would retroactively undress every pet on it.
    function allowCollection(address collection) external onlyCurator {
        if (collection == address(0)) revert ZeroAddress();
        if (collection.code.length == 0) revert BadParams();
        collectionAllowed[collection] = true;
        emit CollectionAllowed(collection, true);
    }

    /// @notice Offer the role to `to`; nothing changes until they accept, and the offer can be withdrawn
    ///         by offering to someone else or to nobody (address 0).
    function setCurator(address to) external onlyCurator {
        pendingCurator = to;
        emit CuratorProposed(curator, to);
    }

    /// @notice Take the role that was offered to you.
    function acceptCurator() external {
        if (msg.sender != pendingCurator || msg.sender == address(0)) revert NotCurator();
        emit CuratorChanged(curator, msg.sender);
        curator = msg.sender;
        pendingCurator = address(0);
    }

    /// @notice Give the role up. Nothing can ever be added, sealed, granted or allowed again.
    function renounceCurator() external onlyCurator {
        emit CuratorChanged(curator, address(0));
        curator = address(0);
        pendingCurator = address(0);
    }

    // ---------------------------------------------------------------- claiming
    /// @notice Claim `qty` copies of an item under its rules. `gateData` is the hint its gate wants, if any.
    ///         The per-key cap counts against the wallet, or against whatever the gate keys on (the cat,
    ///         for NamedCatGate), so pass the cat you want to count.
    function claim(uint256 id, uint32 qty, bytes calldata gateData) external payable nonReentrant {
        Item storage it = _item(id);
        if (qty == 0) revert BadParams();
        if (it.isSealed) revert IsSealed();
        if (block.timestamp < it.opens) revert NotOpenYet();
        if (it.closes != 0 && block.timestamp >= it.closes) revert Closed();
        if (it.maxSupply != 0 && it.minted + qty > it.maxSupply) revert SoldOut();
        bytes32 key = _gateKey(it.gate, msg.sender, gateData);
        if (it.perKey != 0 && claimedBy[id][key] + qty > it.perKey) revert CapReached();
        uint256 due = uint256(it.price) * qty;
        if (msg.value != due) revert WrongValue(due, msg.value);

        claimedBy[id][key] += qty;
        it.minted += qty;
        if (due > 0) _split(due);
        // while a fallback clock runs, every claim re-checks the path, so a recovery nobody cranked
        // through still stops the clock
        if (brokenSince != 0 && !swapPathBroken()) {
            brokenSince = 0;
            emit SwapPathNoted(false, 0);
        }
        _balances[id][msg.sender] += qty;
        emit TransferSingle(msg.sender, address(0), msg.sender, id, qty);
        emit Claimed(id, msg.sender, qty, due);
        _checkReceiver(msg.sender, address(0), msg.sender, id, qty, "");
    }

    /// @dev The key the per-key cap counts against: the wallet, or what the gate says. Reverts
    ///      NotEligible for a gate that says no, reverts, answers in the wrong shape, or returns key 0.
    function _gateKey(address gate, address who, bytes calldata data) private view returns (bytes32 key) {
        if (gate == address(0)) return bytes32(uint256(uint160(who)));
        (bool answered, bool ok, bytes32 k) = _ask(gate, who, data, gasleft());
        if (!answered || !ok || k == 0) revert NotEligible();
        return k;
    }

    /// @dev Ask a gate without trusting its ABI: `try` only catches a revert, not a malformed answer.
    function _ask(address gate, address who, bytes memory data, uint256 gas)
        private
        view
        returns (bool answered, bool ok, bytes32 key)
    {
        (bool success, bytes memory ret) =
            gate.staticcall{gas: gas}(abi.encodeWithSelector(IGate.eligible.selector, who, data));
        if (!success || ret.length < 64) return (false, false, 0);
        // decode by hand: abi.decode reverts on a bool word that is not 0 or 1, and a malformed
        // answer must read as "no", never as a raw revert
        (uint256 okWord, bytes32 k) = abi.decode(ret, (uint256, bytes32));
        if (okWord > 1) return (false, false, 0);
        return (true, okWord == 1, k);
    }

    /// @notice Why a claim would fail, without sending it: `reason` 0 = it would go through, 1 no such
    ///         item, 2 sealed, 3 not open yet, 4 closed, 5 sold out, 6 not eligible, 7 cap reached.
    ///         `key` is what the cap counts against and `due` the exact value to send.
    function canClaim(uint256 id, address who, uint32 qty, bytes calldata data)
        external
        view
        returns (bool ok, uint8 reason, bytes32 key, uint256 due)
    {
        if (id == 0 || id > itemCount || qty == 0) return (false, 1, 0, 0);
        Item storage it = _items[id];
        due = uint256(it.price) * qty;
        if (it.isSealed) return (false, 2, 0, due);
        if (block.timestamp < it.opens) return (false, 3, 0, due);
        if (it.closes != 0 && block.timestamp >= it.closes) return (false, 4, 0, due);
        if (it.maxSupply != 0 && it.minted + qty > it.maxSupply) return (false, 5, 0, due);
        if (it.gate == address(0)) {
            key = bytes32(uint256(uint160(who)));
        } else {
            (bool answered, bool eligible, bytes32 k) = _ask(it.gate, who, data, gasleft());
            if (!answered || !eligible || k == 0) return (false, 6, 0, due);
            key = k;
        }
        if (it.perKey != 0 && claimedBy[id][key] + qty > it.perKey) return (false, 7, key, due);
        return (true, 0, key, due);
    }

    /// @notice How many more copies an item can still mint; type(uint256).max if unlimited.
    function remaining(uint256 id) external view returns (uint256) {
        Item storage it = _item(id);
        if (it.isSealed) return 0;
        if (it.maxSupply == 0) return type(uint256).max;
        return it.maxSupply - it.minted;
    }

    // ---------------------------------------------------------------- equipping
    /// @dev The list is per (pet, owner): what you put on a pet is yours, not the pet's. Sell the pet and
    ///      its buyer starts bare; buy it back and your outfit is still there.
    function _key(address collection, uint256 tokenId, address owner) private pure returns (bytes32) {
        return keccak256(abi.encode(collection, tokenId, owner));
    }

    /// @notice Put an item on a pet you own. You must hold at least one copy. A pet carries a set, so an
    ///         outfit, a room theme and a companion can all be on at once; the site decides how they show.
    ///         Cosmetic, scene and passive items go on (a passive one is how a ticket binds to a pet);
    ///         consumables do not.
    function equip(address collection, uint256 tokenId, uint256 itemId) external {
        _equip(collection, tokenId, itemId);
    }

    /// @notice The same item on many pets you own, in one transaction: one copy dresses the whole wallet.
    function equipMany(address collection, uint256[] calldata tokenIds, uint256 itemId) external {
        for (uint256 i = 0; i < tokenIds.length; i++) {
            _equip(collection, tokenIds[i], itemId);
        }
    }

    function _equip(address collection, uint256 tokenId, uint256 itemId) private {
        Item storage it = _item(itemId);
        if (!collectionAllowed[collection]) revert CollectionNotAllowed();
        if (IOwnerOf(collection).ownerOf(tokenId) != msg.sender) revert NotOwner();
        if (_balances[itemId][msg.sender] == 0) revert NotHolder();
        if (it.kind == Kind.Consumable) revert NotEquippable();
        bytes32 k = _key(collection, tokenId, msg.sender);
        if (_equippedAt[k][itemId] != 0) return; // already on
        uint256[] storage list = _equipped[k];
        if (list.length >= MAX_EQUIPPED) revert TooManyEquipped();
        list.push(itemId);
        _equippedAt[k][itemId] = list.length;
        emit Equipped(collection, tokenId, itemId, msg.sender);
    }

    /// @notice Take an item off a pet you own.
    function unequip(address collection, uint256 tokenId, uint256 itemId) external {
        if (IOwnerOf(collection).ownerOf(tokenId) != msg.sender) revert NotOwner();
        bytes32 k = _key(collection, tokenId, msg.sender);
        uint256 at = _equippedAt[k][itemId];
        if (at == 0) revert NotEquipped();
        uint256[] storage list = _equipped[k];
        uint256 last = list[list.length - 1];
        list[at - 1] = last;
        _equippedAt[k][last] = at;
        list.pop();
        delete _equippedAt[k][itemId];
        emit Unequipped(collection, tokenId, itemId, msg.sender);
    }

    /// @notice Drop the entries a pet's current owner no longer holds. Anyone may: it only removes what
    ///         `equipped` already hides, so a full list of sold items does not block the owner.
    function prune(address collection, uint256 tokenId) external {
        address owner = IOwnerOf(collection).ownerOf(tokenId);
        bytes32 k = _key(collection, tokenId, owner);
        uint256[] storage list = _equipped[k];
        for (uint256 i = list.length; i > 0; i--) {
            uint256 itemId = list[i - 1];
            if (_balances[itemId][owner] > 0) continue;
            uint256 last = list[list.length - 1];
            list[i - 1] = last;
            _equippedAt[k][last] = i;
            list.pop();
            delete _equippedAt[k][itemId];
            emit Unequipped(collection, tokenId, itemId, owner);
        }
    }

    /// @notice What a pet is wearing right now: the items its current owner put on it and still holds.
    ///         Sell the item and it drops out of this list by itself; buy it back and it is on again.
    ///         Empty, never a revert, for a collection or token that cannot answer `ownerOf`.
    function equipped(address collection, uint256 tokenId) external view returns (uint256[] memory out) {
        address owner = _ownerOf(collection, tokenId);
        if (owner == address(0)) return out;
        uint256[] storage list = _equipped[_key(collection, tokenId, owner)];
        uint256 n;
        uint256[] memory tmp = new uint256[](list.length);
        for (uint256 i = 0; i < list.length; i++) {
            if (_balances[list[i]][owner] > 0) tmp[n++] = list[i];
        }
        out = new uint256[](n);
        for (uint256 i = 0; i < n; i++) {
            out[i] = tmp[i];
        }
    }

    /// @notice `equipped` for a page of pets in one call.
    function equippedMany(address collection, uint256[] calldata tokenIds)
        external
        view
        returns (uint256[][] memory out)
    {
        out = new uint256[][](tokenIds.length);
        for (uint256 i = 0; i < tokenIds.length; i++) {
            out[i] = this.equipped(collection, tokenIds[i]);
        }
    }

    /// @dev `ownerOf` that never reverts: zero for no code, a revert, or malformed return data.
    function _ownerOf(address collection, uint256 tokenId) private view returns (address) {
        if (collection.code.length == 0) return address(0);
        (bool ok, bytes memory ret) = collection.staticcall(abi.encodeWithSelector(IOwnerOf.ownerOf.selector, tokenId));
        if (!ok || ret.length < 32) return address(0);
        uint256 word = abi.decode(ret, (uint256));
        if (word > type(uint160).max) return address(0);
        return address(uint160(word));
    }

    // ---------------------------------------------------------------- consuming
    /// @notice Burn copies you hold, or that you are approved to move. This is how a one-time-use item
    ///         is spent: a mechanics contract you have approved consumes it.
    function consume(address from, uint256 id, uint256 qty) external {
        if (from != msg.sender && !_operators[from][msg.sender]) revert NotApproved();
        _burnCopies(from, id, qty);
        emit Consumed(from, id, qty);
    }

    /// @notice Spend copies you hold on a mechanics contract, with no operator approval: the copies are
    ///         burned first, then `target.onItemUsed(you, id, qty, data)` runs and must acknowledge.
    ///         This is how a one-time-use item reaches a future contract that cannot be trusted with
    ///         `setApprovalForAll` over everything you own.
    function use(uint256 id, uint256 qty, address target, bytes calldata data) external nonReentrant {
        if (target.code.length == 0) revert BadSink();
        _burnCopies(msg.sender, id, qty);
        emit Used(msg.sender, id, qty, target);
        try IItemSink(target).onItemUsed(msg.sender, id, qty, data) returns (bytes4 r) {
            if (r != IItemSink.onItemUsed.selector) revert BadSink();
        } catch {
            revert BadSink();
        }
    }

    function _burnCopies(address from, uint256 id, uint256 qty) private {
        if (qty == 0) revert BadParams();
        uint256 bal = _balances[id][from];
        if (bal < qty) revert Insufficient();
        _balances[id][from] = bal - qty;
        burned[id] += qty;
        emit TransferSingle(msg.sender, from, address(0), id, qty);
    }

    /// @notice ERC-5615: copies in circulation, minted less consumed.
    function totalSupply(uint256 id) external view returns (uint256) {
        return _items[id].minted - burned[id];
    }

    /// @notice ERC-5615: whether the id is an item.
    function exists(uint256 id) external view returns (bool) {
        return id != 0 && id <= itemCount;
    }

    // ---------------------------------------------------------------- money, exactly as the game does it
    function _split(uint256 amount) private {
        uint256 toTreasury = (amount * TREASURY_BPS) / BPS;
        uint256 toTeam = (amount * TEAM_BPS) / BPS;
        treasuryOwed += uint128(toTreasury);
        teamOwed += uint128(toTeam);
        pendingBurnMon += amount - toTreasury - toTeam;
    }

    /// @notice Push queued MON through nad.fun into EMO and burn it, up to `maxMon` and up to what the
    ///         impact guard allows in one go, so `crankBurn(type(uint256).max, 0)` always burns a slice
    ///         of a backlog instead of nothing.
    function crankBurn(uint256 maxMon, uint256 minEmoOut) external nonReentrant {
        if (lastBurnBlock == block.number) revert NothingToDo(); // the guard is per block, not per call
        uint256 amount = pendingBurnMon < maxMon ? pendingBurnMon : maxMon;
        uint256 cap = _maxIn();
        if (amount > cap) amount = cap;
        if (amount == 0) revert NothingToDo();
        lastBurnBlock = block.number;
        pendingBurnMon -= amount;
        _burn(amount, minEmoOut);
    }

    /// @notice The most MON one burn may push through the pool right now (`MAX_IMPACT_BPS` of its WMON).
    function _maxIn() private view returns (uint256) {
        if (WMON.code.length == 0) return 0;
        try IERC20Balance(WMON).balanceOf(POOL) returns (uint256 depth) {
            return (depth * MAX_IMPACT_BPS) / BPS;
        } catch {
            return 0;
        }
    }

    /// @notice MON that arrived outside a claim joins the burn queue. Anyone.
    function skim() external nonReentrant {
        uint256 tracked = pendingBurnMon + treasuryOwed + teamOwed;
        uint256 excess = address(this).balance - tracked;
        if (excess == 0) revert NothingToDo();
        pendingBurnMon += excess;
        emit BurnQueued(excess, pendingBurnMon);
    }

    /// @notice Pay the treasury and team what they are owed. A refusing receiver stays owed.
    function sweep() external nonReentrant {
        uint256 t = treasuryOwed;
        uint256 m = teamOwed;
        if (t == 0 && m == 0) revert NothingToDo();
        uint256 paidT;
        uint256 paidM;
        if (t > 0) {
            treasuryOwed = 0;
            (bool ok,) = TREASURY.call{value: t}("");
            if (ok) paidT = t;
            else treasuryOwed = uint128(t);
        }
        if (m > 0) {
            teamOwed = 0;
            (bool ok,) = TEAM.call{value: m}("");
            if (ok) paidM = m;
            else teamOwed = uint128(m);
        }
        if (paidT == 0 && paidM == 0) revert NothingToDo();
        emit Swept(paidT, paidM);
    }

    receive() external payable {}

    /// @notice True while queued MON cannot reach EMO right now: a nad.fun contract without code, the
    ///         Lens reverting or naming a router other than the one pinned here (nad.fun has shipped new
    ///         routers before), or a pool with no WMON or no EMO to quote.
    function swapPathBroken() public view returns (bool) {
        if (address(ROUTER).code.length == 0 || address(LENS).code.length == 0 || WMON.code.length == 0) return true;
        if (_maxIn() == 0) return true;
        (address router, uint256 quoted) = _safeQuote(1 ether);
        return router != address(ROUTER) || quoted == 0;
    }

    /// @notice Record whether the swap path works. Anyone. The first note of a broken path starts the
    ///         `FALLBACK_DELAY` clock; a note of a working path clears it, as does any successful burn
    ///         and any claim made while the path works. The fallback therefore needs the path seen
    ///         broken at two moments at least `FALLBACK_DELAY` apart with no working observation in
    ///         between; a one-block outage never diverts the queue from EMO to raw MON.
    function noteSwapPath() external {
        bool broken = swapPathBroken();
        if (broken && brokenSince == 0) brokenSince = block.timestamp;
        if (!broken) brokenSince = 0;
        emit SwapPathNoted(broken, brokenSince);
    }

    /// @notice If the swap path has been seen broken for `FALLBACK_DELAY` with nothing working in between,
    ///         burn the queued MON itself rather than let it sit locked forever. Anyone. The promise was
    ///         that this MON is burned; EMO was the preferred form.
    function crankFallback(uint256 maxMon) external nonReentrant {
        if (!swapPathBroken()) revert NothingToDo();
        if (brokenSince == 0 || block.timestamp < brokenSince + FALLBACK_DELAY) revert FallbackNotReady();
        uint256 amount = pendingBurnMon < maxMon ? pendingBurnMon : maxMon;
        if (amount == 0) revert NothingToDo();
        pendingBurnMon -= amount;
        totalMonBurned += amount;
        (bool ok,) = BURN_ADDRESS.call{value: amount}("");
        if (!ok) revert NothingToDo();
        emit Burn(amount, 0);
    }

    function _burn(uint256 monIn, uint256 minEmoOut) private returns (uint256 emoOut) {
        if (address(ROUTER).code.length == 0 || address(LENS).code.length == 0 || WMON.code.length == 0) {
            return _queue(monIn);
        }
        uint256 depth;
        try IERC20Balance(WMON).balanceOf(POOL) returns (uint256 d) {
            depth = d;
        } catch {
            depth = 0;
        }
        uint256 maxIn = (depth * MAX_IMPACT_BPS) / BPS;
        if (depth == 0 || monIn > maxIn) return _queue(monIn);
        (address router, uint256 quoted) = _safeQuote(monIn);
        if (router != address(ROUTER) || quoted == 0) return _queue(monIn);
        uint256 minOut = (quoted * (BPS - MAX_IMPACT_BPS)) / BPS;
        if (minEmoOut > minOut) minOut = minEmoOut;
        try ROUTER.buy{value: monIn}(
            INadRouter.BuyParams({amountOutMin: minOut, token: EMO, to: BURN_ADDRESS, deadline: block.timestamp})
        ) returns (
            uint256 amountOut
        ) {
            emoOut = amountOut;
            totalEmoBurned += emoOut;
            totalMonBurned += monIn;
            if (brokenSince != 0) {
                brokenSince = 0; // the path works
                emit SwapPathNoted(false, 0);
            }
            emit Burn(monIn, emoOut);
        } catch {
            return _queue(monIn);
        }
    }

    function _queue(uint256 monIn) private returns (uint256) {
        pendingBurnMon += monIn;
        emit BurnQueued(monIn, pendingBurnMon);
        return 0;
    }

    function _safeQuote(uint256 monIn) private view returns (address router, uint256 amountOut) {
        try LENS.getAmountOut(EMO, monIn, true) returns (address r, uint256 out) {
            router = r;
            amountOut = out;
        } catch {
            router = address(0);
            amountOut = 0;
        }
    }

    // ---------------------------------------------------------------- ERC-1155
    function balanceOf(address account, uint256 id) public view returns (uint256) {
        return _balances[id][account];
    }

    function balanceOfBatch(address[] calldata accounts, uint256[] calldata ids)
        external
        view
        returns (uint256[] memory out)
    {
        if (accounts.length != ids.length) revert LengthMismatch();
        out = new uint256[](ids.length);
        for (uint256 i = 0; i < ids.length; i++) {
            out[i] = _balances[ids[i]][accounts[i]];
        }
    }

    /// @notice Everything a wallet holds, ids and counts, zero balances left out.
    function holdings(address who) external view returns (uint256[] memory ids, uint256[] memory balances) {
        uint256 n = itemCount;
        uint256[] memory tmp = new uint256[](n);
        uint256 k;
        for (uint256 id = 1; id <= n; id++) {
            if (_balances[id][who] > 0) tmp[k++] = id;
        }
        ids = new uint256[](k);
        balances = new uint256[](k);
        for (uint256 i = 0; i < k; i++) {
            ids[i] = tmp[i];
            balances[i] = _balances[tmp[i]][who];
        }
    }

    /// @notice Items `from` to `to` inclusive, for the shop page in one call.
    function catalogue(uint256 from, uint256 to) external view returns (Item[] memory out) {
        if (from == 0 || to > itemCount || from > to) revert NoItem();
        out = new Item[](to - from + 1);
        for (uint256 id = from; id <= to; id++) {
            out[id - from] = _items[id];
        }
    }

    function setApprovalForAll(address operator, bool approved) external {
        _operators[msg.sender][operator] = approved;
        emit ApprovalForAll(msg.sender, operator, approved);
    }

    function isApprovedForAll(address account, address operator) public view returns (bool) {
        return _operators[account][operator];
    }

    function safeTransferFrom(address from, address to, uint256 id, uint256 value, bytes calldata data) external {
        if (from != msg.sender && !_operators[from][msg.sender]) revert NotApproved();
        _move(from, to, id, value);
        emit TransferSingle(msg.sender, from, to, id, value);
        _checkReceiver(msg.sender, from, to, id, value, data);
    }

    function safeBatchTransferFrom(
        address from,
        address to,
        uint256[] calldata ids,
        uint256[] calldata values,
        bytes calldata data
    ) external {
        if (from != msg.sender && !_operators[from][msg.sender]) revert NotApproved();
        if (ids.length != values.length) revert LengthMismatch();
        for (uint256 i = 0; i < ids.length; i++) {
            _move(from, to, ids[i], values[i]);
        }
        emit TransferBatch(msg.sender, from, to, ids, values);
        if (to.code.length > 0) {
            try IERC1155Receiver(to).onERC1155BatchReceived(msg.sender, from, ids, values, data) returns (bytes4 r) {
                if (r != IERC1155Receiver.onERC1155BatchReceived.selector) revert BadReceiver();
            } catch {
                revert BadReceiver();
            }
        }
    }

    function _move(address from, address to, uint256 id, uint256 value) private {
        if (to == address(0)) revert ZeroAddress();
        if (_items[id].soulbound) revert Soulbound();
        uint256 bal = _balances[id][from];
        if (bal < value) revert Insufficient();
        _balances[id][from] = bal - value;
        _balances[id][to] += value;
    }

    function _checkReceiver(address operator, address from, address to, uint256 id, uint256 value, bytes memory data)
        private
    {
        if (to.code.length == 0) return;
        try IERC1155Receiver(to).onERC1155Received(operator, from, id, value, data) returns (bytes4 r) {
            if (r != IERC1155Receiver.onERC1155Received.selector) revert BadReceiver();
        } catch {
            revert BadReceiver();
        }
    }

    // ---------------------------------------------------------------- ERC-2981, ERC-165
    function royaltyInfo(uint256, uint256 salePrice) external view returns (address, uint256) {
        return (TREASURY, (salePrice * ROYALTY_BPS) / BPS);
    }

    function supportsInterface(bytes4 id) external pure returns (bool) {
        return id == 0x01ffc9a7 // ERC-165
            || id == 0xd9b67a26 // ERC-1155
            || id == 0x0e89341c // ERC-1155 metadata
            || id == 0x2a55205a; // ERC-2981
    }

    // ---------------------------------------------------------------- metadata, on chain
    function item(uint256 id) external view returns (Item memory) {
        return _item(id);
    }

    function _item(uint256 id) private view returns (Item storage it) {
        if (id == 0 || id > itemCount) revert NoItem();
        it = _items[id];
    }

    function imageOf(uint256 id) public view returns (string memory) {
        return string(_read(_item(id).art));
    }

    function uri(uint256 id) public view returns (string memory) {
        return string(abi.encodePacked("data:application/json;base64,", Base64.encode(bytes(metadata(id)))));
    }

    /// @notice The item's metadata JSON, plain, for anything that would rather not decode base64.
    function metadata(uint256 id) public view returns (string memory) {
        Item storage it = _item(id);
        bytes memory json = abi.encodePacked(
            '{"name":"',
            _esc(it.name),
            '","description":"',
            _esc(it.description),
            '","image":"data:image/svg+xml;base64,',
            Base64.encode(_read(it.art)),
            '","attributes":[',
            '{"trait_type":"kind","value":"',
            _kindName(it.kind),
            '"},{"trait_type":"slot","value":',
            _u(it.slot),
            '},{"trait_type":"max supply","value":',
            _u(it.maxSupply),
            '},{"trait_type":"soulbound","value":',
            it.soulbound ? '"yes"' : '"no"',
            "}]}"
        );
        return string(json);
    }

    function contractURI() external view returns (string memory) {
        bytes memory json = abi.encodePacked(
            '{"name":"Emogotchi Items","description":"Costumes, accessories, room themes and tools for a cat that lives in your wallet. Every item is added forever and never changed. 80% of every paid item buys EMO and burns it.",',
            '"image":"data:image/svg+xml;base64,',
            Base64.encode(_read(COLLECTION_ART)),
            '","external_link":"https://emogotchi.emonad.lol","seller_fee_basis_points":',
            _u(ROYALTY_BPS),
            ',"fee_recipient":"',
            _addr(TREASURY),
            '"}'
        );
        return string(abi.encodePacked("data:application/json;base64,", Base64.encode(json)));
    }

    /// @dev SSTORE2 read: the pointer's code is a STOP byte followed by the data.
    function _read(address pointer) private view returns (bytes memory data) {
        assembly ("memory-safe") {
            let size := sub(extcodesize(pointer), 1)
            data := mload(0x40)
            mstore(0x40, add(data, and(add(add(size, 0x20), 0x1f), not(0x1f))))
            mstore(data, size)
            extcodecopy(pointer, add(data, 0x20), 1, size)
        }
    }

    function _kindName(Kind k) private pure returns (string memory) {
        if (k == Kind.Cosmetic) return "cosmetic";
        if (k == Kind.Scene) return "scene";
        if (k == Kind.Passive) return "passive";
        if (k == Kind.Consumable) return "consumable";
        return "none";
    }

    function _u(uint256 v) private pure returns (string memory) {
        if (v == 0) return "0";
        uint256 t = v;
        uint256 len;
        while (t != 0) {
            len++;
            t /= 10;
        }
        bytes memory b = new bytes(len);
        while (v != 0) {
            b[--len] = bytes1(uint8(48 + (v % 10)));
            v /= 10;
        }
        return string(b);
    }

    function _addr(address a) private pure returns (string memory) {
        bytes16 hexd = 0x30313233343536373839616263646566;
        bytes memory s = new bytes(42);
        s[0] = "0";
        s[1] = "x";
        uint160 v = uint160(a);
        for (uint256 i = 41; i > 1; i--) {
            s[i] = hexd[v & 0xf];
            v >>= 4;
        }
        return string(s);
    }

    function _esc(string memory str) private pure returns (string memory) {
        bytes memory b = bytes(str);
        uint256 extra;
        for (uint256 i = 0; i < b.length; i++) {
            if (b[i] == '"' || b[i] == "\\") extra++;
            else if (uint8(b[i]) < 0x20) extra += 5; // \u00XX
        }
        if (extra == 0) return str;
        bytes memory o = new bytes(b.length + extra);
        bytes16 hexd = 0x30313233343536373839616263646566;
        uint256 j;
        for (uint256 i = 0; i < b.length; i++) {
            uint8 c = uint8(b[i]);
            if (b[i] == '"' || b[i] == "\\") {
                o[j++] = "\\";
                o[j++] = b[i];
            } else if (c < 0x20) {
                o[j++] = "\\";
                o[j++] = "u";
                o[j++] = "0";
                o[j++] = "0";
                o[j++] = hexd[c >> 4];
                o[j++] = hexd[c & 0xf];
            } else {
                o[j++] = b[i];
            }
        }
        return string(o);
    }
}
