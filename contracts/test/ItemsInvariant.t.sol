// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Test, console2} from "forge-std/Test.sol";
import {CommonBase} from "forge-std/Base.sol";
import {StdCheats} from "forge-std/StdCheats.sol";
import {StdUtils} from "forge-std/StdUtils.sol";
import {Emogotchi} from "../src/Emogotchi.sol";
import {EmogotchiItems} from "../src/EmogotchiItems.sol";
import {IGate} from "../src/gates/IGate.sol";
import {NamedCatGate} from "../src/gates/NamedCatGate.sol";
import {HoldsGate} from "../src/gates/HoldsGate.sol";
import {MockEMO, MockWMON, MockNad, MockArt} from "./mocks/Mocks.sol";

/// @dev A mechanics contract that accepts used items and counts them.
contract Sink {
    uint256 public got;

    function onItemUsed(address, uint256, uint256 qty, bytes calldata) external returns (bytes4) {
        got += qty;
        return this.onItemUsed.selector;
    }
}

/// @dev Stateful fuzz of the item shop. The handler is a model: before every call it works out from
///      the item's rules whether the call must succeed, then insists the contract agreed. It also
///      mirrors the equip lists with the same swap-remove algorithm so `equipped()` can be checked
///      exactly, and keeps ghost totals of every wei in and out so conservation can be checked.
///      `fail_on_revert` is on: any revert that the model did not predict fails the run.
contract ReceiverWallet {
    function onERC1155Received(address, address, uint256, uint256, bytes calldata) external pure returns (bytes4) {
        return this.onERC1155Received.selector;
    }

    function onERC1155BatchReceived(address, address, uint256[] calldata, uint256[] calldata, bytes calldata)
        external
        pure
        returns (bytes4)
    {
        return this.onERC1155BatchReceived.selector;
    }

    receive() external payable {}
}

contract NonReceiver {
    receive() external payable {}
}

contract ItemsHandler is CommonBase, StdCheats, StdUtils {
    Emogotchi public game;
    EmogotchiItems public items;
    NamedCatGate public named;
    HoldsGate public holds;
    MockNad public nad;
    Sink public sink;
    address public treasury;
    address public team;
    address[] public actors;
    uint256 public catCount;
    uint256 public constant START = 10_000 ether;
    uint256 public constant MAX_ITEMS = 13;

    // ghosts
    mapping(uint256 => EmogotchiItems.Item) public snap; // rules at creation
    mapping(uint256 => uint256) public consumed;
    mapping(uint256 => bool) public sealedGhost;
    mapping(uint256 => uint256) public sealedMinted;
    mapping(address => mapping(address => bool)) public approved;
    mapping(bytes32 => uint256[]) internal ghostList; // keyed like the contract: (cat, owner)
    mapping(bytes32 => mapping(uint256 => bool)) public ghostOn;
    mapping(address => uint256) public spent;
    uint256 public paid;
    uint256 public donated;
    uint256 public skimmed;
    uint256 public burnedRouter;
    uint256 public burnedFallback;
    uint256 public sweptT;
    uint256 public sweptM;
    mapping(bytes32 => uint256) public calls;
    mapping(uint256 => mapping(bytes32 => uint256)) public claimedGhost; // (item, key) => copies claimed
    uint256 public shareT; // sum of per-claim floor(due * TREASURY_BPS / BPS)
    uint256 public shareM;
    uint256 public shareB; // sum of per-claim remainder
    address public receiverActor; // a contract wallet with the ERC-1155 hooks
    address public nonReceiver; // a contract wallet without them

    constructor(
        Emogotchi g,
        EmogotchiItems i,
        NamedCatGate n,
        HoldsGate h,
        MockNad d,
        address t,
        address m,
        address[] memory a,
        uint256 cats
    ) {
        game = g;
        items = i;
        named = n;
        holds = h;
        nad = d;
        treasury = t;
        team = m;
        actors = a;
        catCount = cats;
        sink = new Sink();
        receiverActor = a[a.length - 1];
        nonReceiver = address(new NonReceiver());
        for (uint256 id = 1; id <= items.itemCount(); id++) {
            snap[id] = items.item(id);
        }
    }

    function gk(uint256 cat, address owner) public pure returns (bytes32) {
        return keccak256(abi.encode(cat, owner));
    }

    function ghostLength(uint256 cat, address owner) external view returns (uint256) {
        return ghostList[gk(cat, owner)].length;
    }

    function ghostAt(uint256 cat, address owner, uint256 i) external view returns (uint256) {
        return ghostList[gk(cat, owner)][i];
    }

    function actorCount() external view returns (uint256) {
        return actors.length;
    }

    function _actor(uint256 seed) internal view returns (address) {
        return actors[bound(seed, 0, actors.length - 1)];
    }

    function _id(uint256 seed) internal view returns (uint256) {
        return bound(seed, 1, items.itemCount());
    }

    function _cat(uint256 seed) internal view returns (uint256) {
        return bound(seed, 1, catCount);
    }

    function _count(bytes32 k) internal {
        calls[k]++;
    }

    // ---------------------------------------------------------------- claims
    function claim(uint256 a, uint256 i, uint32 qty, uint256 hint, uint8 mode) external {
        _count("claim");
        address actor = _actor(a);
        uint256 id = _id(i);
        qty = uint32(bound(qty, 1, 5));
        EmogotchiItems.Item memory it = items.item(id);
        bytes memory data;
        if (mode % 3 == 1) data = abi.encode(bound(hint, 0, catCount + 1));
        if (mode % 3 == 2) data = hex"01"; // too short for a hint: falls back to the scan
        uint256 ts = vm.getBlockTimestamp();
        bool eligible = true;
        bytes32 key = bytes32(uint256(uint160(actor)));
        if (it.gate != address(0)) (eligible, key) = IGate(it.gate).eligible(actor, data);
        bool ok = !it.isSealed && ts >= it.opens && (it.closes == 0 || ts < it.closes)
            && (it.maxSupply == 0 || it.minted + qty <= it.maxSupply) && eligible
            && (it.perKey == 0 || items.claimedBy(id, key) + qty <= it.perKey);
        uint256 due = uint256(it.price) * qty;
        uint256 value = due;
        if (mode >= 240) {
            value = due + 1; // wrong value must always fail
            ok = false;
        } else if (mode >= 225 && due > 0) {
            value = due - 1; // underpaying must always fail
            ok = false;
        }
        vm.prank(actor);
        try items.claim{value: value}(id, qty, data) {
            require(ok, "model: claim should have failed");
            _count("claimOk");
            if (!_pathBroken()) {
                require(items.brokenSince() == 0, "model: a claim on a working path must clear the clock");
            }
            paid += due;
            spent[actor] += due;
            claimedGhost[id][key] += qty;
            uint256 t = (due * items.TREASURY_BPS()) / items.BPS();
            uint256 m = (due * items.TEAM_BPS()) / items.BPS();
            shareT += t;
            shareM += m;
            shareB += due - t - m;
        } catch {
            require(!ok, "model: claim should have succeeded");
        }
    }

    function grant(uint256 i, uint256 a, uint256 b, uint32 qty) external {
        _count("grant");
        uint256 id = _id(i);
        qty = uint32(bound(qty, 0, 3));
        address[] memory to = new address[](2);
        to[0] = _actor(a);
        to[1] = _actor(b);
        EmogotchiItems.Item memory it = items.item(id);
        bool ok = !it.isSealed && qty > 0 && (it.maxSupply == 0 || it.minted + uint256(qty) * 2 <= it.maxSupply);
        try items.grant(id, to, qty) {
            require(ok, "model: grant should have failed");
        } catch {
            require(!ok, "model: grant should have succeeded");
        }
    }

    function seal(uint256 i, uint256 dice) external {
        if (bound(dice, 0, 3) != 0) return;
        uint256 open;
        for (uint256 id = 1; id <= items.itemCount(); id++) {
            if (!items.item(id).isSealed) open++;
        }
        if (open <= 3) return; // keep the shop alive
        _count("seal");
        uint256 id = _id(i);
        bool was = items.item(id).isSealed;
        try items.seal(id) {
            require(!was, "model: double seal");
            sealedGhost[id] = true;
            sealedMinted[id] = items.item(id).minted;
        } catch {
            require(was, "model: seal should have worked");
        }
        // one way means one way: a second seal must always revert
        try items.seal(id) {
            revert("model: seal reversed");
        } catch {}
        require(items.item(id).isSealed, "model: sealed item is open");
    }

    // nobody but the curator can add, seal, grant or allow; the curator is this handler
    function strangerCurates(uint256 a, uint256 i, uint8 which) external {
        _count("stranger");
        address actor = _actor(a);
        uint256 id = _id(i);
        address[] memory to = new address[](1);
        to[0] = actor;
        EmogotchiItems.CreateParams memory c;
        c.name = "x";
        c.svg = "<svg/>";
        c.kind = EmogotchiItems.Kind.Passive;
        vm.startPrank(actor);
        if (which % 5 == 0) {
            try items.grant(id, to, 1) {
                revert("model: stranger granted");
            } catch {}
        } else if (which % 5 == 1) {
            try items.seal(id) {
                revert("model: stranger sealed");
            } catch {}
        } else if (which % 5 == 2) {
            try items.create(c) {
                revert("model: stranger created");
            } catch {}
        } else if (which % 5 == 3) {
            try items.allowCollection(address(named)) {
                revert("model: stranger allowed");
            } catch {}
        } else {
            try items.setCurator(actor) {
                revert("model: stranger took the role");
            } catch {}
            try items.acceptCurator() {
                revert("model: stranger accepted a role never offered");
            } catch {}
        }
        vm.stopPrank();
    }

    /// @dev Offer the role and withdraw it, or offer it to nobody: the curator must stay this handler.
    function curatorOffer(uint256 a, bool toNobody) external {
        _count("curatorOffer");
        address actor = _actor(a);
        items.setCurator(toNobody ? address(0) : actor);
        require(items.curator() == address(this), "model: offer changed the curator");
        require(items.pendingCurator() == (toNobody ? address(0) : actor), "model: offer not recorded");
        items.setCurator(address(0)); // withdrawn before anyone can take it
        vm.prank(actor);
        try items.acceptCurator() {
            revert("model: withdrawn offer accepted");
        } catch {}
    }

    function createItem(
        uint256 price,
        uint32 maxSupply,
        uint32 perKey,
        uint256 opensIn,
        uint256 lasts,
        uint8 kind,
        uint8 slot,
        bool soulbound,
        uint8 gateSel
    ) external {
        _count("create");
        if (items.itemCount() >= MAX_ITEMS) return;
        EmogotchiItems.CreateParams memory c;
        c.name = "Fuzz item";
        c.description = "made by the fuzzer";
        c.svg = bytes('<svg xmlns="http://www.w3.org/2000/svg"/>');
        c.price =
            uint128([uint256(0), 0.25 ether, 1 ether, 3 ether, 1, 7, 0.333333333333333333 ether][bound(price, 0, 6)]);
        c.maxSupply = uint32(bound(maxSupply, 0, 20));
        c.perKey = uint32(bound(perKey, 0, 3));
        uint256 ts = vm.getBlockTimestamp();
        c.opens = opensIn % 2 == 0 ? 0 : uint64(ts + bound(opensIn, 0, 2 days));
        c.closes = lasts % 2 == 0 ? 0 : uint64((c.opens == 0 ? ts : c.opens) + bound(lasts, 1, 3 days));
        c.kind = EmogotchiItems.Kind(bound(kind, 1, 4));
        c.slot = uint8(bound(slot, 0, 5));
        c.soulbound = soulbound;
        c.gate = [address(0), address(named), address(holds)][gateSel % 3];
        uint256 id = items.create(c);
        snap[id] = items.item(id);
    }

    // ---------------------------------------------------------------- tokens
    function transfer(uint256 s, uint256 a, uint256 b, uint256 i, uint256 qty) external {
        _count("transfer");
        address sender = _actor(s);
        address from = _actor(a);
        address to = _actor(b);
        uint256 id = _id(i);
        uint256 bal = items.balanceOf(from, id);
        qty = bound(qty, 0, bal + 1);
        bool ok = (sender == from || approved[from][sender]) && !items.item(id).soulbound && qty <= bal;
        vm.prank(sender);
        try items.safeTransferFrom(from, to, id, qty, "") {
            require(ok, "model: transfer should have failed");
        } catch {
            require(!ok, "model: transfer should have succeeded");
        }
    }

    function transferToContract(uint256 a, uint256 i, uint256 qty, bool good) external {
        _count("toContract");
        address from = _actor(a);
        address to = good ? receiverActor : nonReceiver;
        uint256 id = _id(i);
        uint256 bal = items.balanceOf(from, id);
        qty = bound(qty, 0, bal + 1);
        bool ok = good && !items.item(id).soulbound && qty <= bal;
        vm.prank(from);
        try items.safeTransferFrom(from, to, id, qty, "") {
            require(ok, "model: transfer to contract should have failed");
        } catch {
            require(!ok, "model: transfer to contract should have succeeded");
        }
    }

    function batchTransfer(uint256 a, uint256 b, uint256 i, uint256 j, uint256 q1, uint256 q2) external {
        _count("batch");
        address from = _actor(a);
        address to = _actor(b);
        uint256[] memory ids = new uint256[](2);
        uint256[] memory vals = new uint256[](2);
        ids[0] = _id(i);
        ids[1] = _id(j);
        vals[0] = bound(q1, 0, items.balanceOf(from, ids[0]) + 1);
        vals[1] = bound(q2, 0, items.balanceOf(from, ids[1]) + 1);
        bool ok = true;
        for (uint256 k = 0; k < 2; k++) {
            if (items.item(ids[k]).soulbound) ok = false;
        }
        if (ids[0] == ids[1]) {
            if (from == to) {
                ok = ok && vals[0] <= items.balanceOf(from, ids[0]) && vals[1] <= items.balanceOf(from, ids[0]);
            } else {
                ok = ok && vals[0] + vals[1] <= items.balanceOf(from, ids[0]);
            }
        } else {
            ok = ok && vals[0] <= items.balanceOf(from, ids[0]) && vals[1] <= items.balanceOf(from, ids[1]);
        }
        vm.prank(from);
        try items.safeBatchTransferFrom(from, to, ids, vals, "") {
            require(ok, "model: batch should have failed");
        } catch {
            require(!ok, "model: batch should have succeeded");
        }
    }

    function consume(uint256 s, uint256 f, uint256 i, uint256 qty) external {
        _count("consume");
        address sender = _actor(s);
        address from = _actor(f);
        uint256 id = _id(i);
        uint256 bal = items.balanceOf(from, id);
        qty = bound(qty, 0, bal + 1);
        bool ok = (sender == from || approved[from][sender]) && qty > 0 && qty <= bal;
        vm.prank(sender);
        try items.consume(from, id, qty) {
            require(ok, "model: consume should have failed");
            consumed[id] += qty;
        } catch {
            require(!ok, "model: consume should have succeeded");
        }
    }

    function useItem(uint256 a, uint256 i, uint256 qty, bool badTarget) external {
        _count("use");
        address actor = _actor(a);
        uint256 id = _id(i);
        uint256 bal = items.balanceOf(actor, id);
        qty = bound(qty, 0, bal + 1);
        address target = badTarget ? address(nad) : address(sink); // nad has no onItemUsed
        bool ok = !badTarget && qty > 0 && qty <= bal;
        uint256 got = sink.got();
        vm.prank(actor);
        try items.use(id, qty, target, "") {
            require(ok, "model: use should have failed");
            require(sink.got() == got + qty, "model: sink not told");
            consumed[id] += qty;
        } catch {
            require(!ok, "model: use should have succeeded");
        }
    }

    function approve(uint256 a, uint256 b, bool flag) external {
        _count("approve");
        address owner = _actor(a);
        address op = _actor(b);
        vm.prank(owner);
        items.setApprovalForAll(op, flag);
        approved[owner][op] = flag;
    }

    // ---------------------------------------------------------------- equipping
    /// @dev Give `actor` one copy of a free, open, ungated equippable they do not hold yet, through the
    ///      modelled claim, so aimed equips have stock and lists grow past one entry.
    function _stock(address actor, uint256 seed) internal {
        uint256 total = items.itemCount();
        uint256 ts = vm.getBlockTimestamp();
        seed = seed % total;
        for (uint256 k = 0; k < total; k++) {
            uint256 id = ((seed + k) % total) + 1;
            EmogotchiItems.Item memory it = items.item(id);
            if (
                it.price != 0 || it.gate != address(0) || it.isSealed || it.maxSupply != 0 || it.opens > ts
                    || it.closes != 0 || it.kind == EmogotchiItems.Kind.Consumable || items.balanceOf(actor, id) > 0
            ) continue;
            vm.prank(actor);
            items.claim(id, 1, ""); // must succeed: fail_on_revert says so if not
            _count("stockOk");
            claimedGhost[id][bytes32(uint256(uint160(actor)))] += 1;
            return;
        }
    }

    function equip(uint256 a, uint256 c, uint256 i, uint8 aim) external {
        _count("equip");
        address actor = _actor(a);
        uint256 cat = _cat(c);
        uint256 id = _id(i);
        if (aim % 4 != 0) {
            // point at a cat this actor owns and an item they hold, so the list machinery gets traffic
            _stock(actor, i);
            uint256 n = game.balanceOf(actor);
            if (n > 0) cat = game.tokenOfOwnerByIndex(actor, c % n);
            uint256 total = items.itemCount();
            for (uint256 k = 0; k < total; k++) {
                uint256 cand = ((id - 1 + k) % total) + 1;
                if (items.balanceOf(actor, cand) > 0) {
                    id = cand;
                    break;
                }
            }
        }
        EmogotchiItems.Item memory it = items.item(id);
        bytes32 k = gk(cat, actor);
        bool on = ghostOn[k][id];
        bool ok = game.ownerOf(cat) == actor && items.balanceOf(actor, id) > 0
            && it.kind != EmogotchiItems.Kind.Consumable && (on || ghostList[k].length < items.MAX_EQUIPPED());
        vm.prank(actor);
        try items.equip(address(game), cat, id) {
            require(ok, "model: equip should have failed");
            _count("equipOk");
            if (!on) {
                ghostList[k].push(id);
                ghostOn[k][id] = true;
            }
        } catch {
            require(!ok, "model: equip should have succeeded");
        }
    }

    function equipStrangeCollection(uint256 a, uint256 c, uint256 i) external {
        _count("equipStrange");
        vm.prank(_actor(a));
        try items.equip(address(named), _cat(c), _id(i)) {
            revert("model: unregistered collection equipped");
        } catch {}
    }

    function unequip(uint256 a, uint256 c, uint256 i, uint8 aim) external {
        _count("unequip");
        address actor = _actor(a);
        uint256 cat = _cat(c);
        uint256 id = _id(i);
        if (aim % 4 != 0) {
            uint256 n = game.balanceOf(actor);
            if (n > 0) cat = game.tokenOfOwnerByIndex(actor, c % n);
            uint256[] storage l = ghostList[gk(cat, actor)];
            if (l.length > 0) id = l[i % l.length];
        }
        bool ok = game.ownerOf(cat) == actor && ghostOn[gk(cat, actor)][id];
        vm.prank(actor);
        try items.unequip(address(game), cat, id) {
            require(ok, "model: unequip should have failed");
            _count("unequipOk");
            _ghostRemove(gk(cat, actor), id);
        } catch {
            require(!ok, "model: unequip should have succeeded");
        }
    }

    function prune(uint256 c) external {
        _count("prune");
        uint256 cat = _cat(c);
        address owner = game.ownerOf(cat);
        items.prune(address(game), cat);
        bytes32 key = gk(cat, owner);
        uint256[] storage list = ghostList[key];
        for (uint256 k = list.length; k > 0; k--) {
            uint256 id = list[k - 1];
            if (items.balanceOf(owner, id) > 0) continue;
            list[k - 1] = list[list.length - 1];
            list.pop();
            ghostOn[key][id] = false;
        }
    }

    function _ghostRemove(bytes32 key, uint256 id) internal {
        uint256[] storage list = ghostList[key];
        for (uint256 k = 0; k < list.length; k++) {
            if (list[k] == id) {
                list[k] = list[list.length - 1];
                list.pop();
                break;
            }
        }
        ghostOn[key][id] = false;
    }

    /// @dev The whole swap-remove dance on one (cat, owner), checked against the mirror after every step:
    ///      three on, take a non-last off (the last moves into its slot), put it back, take the moved
    ///      one off, sell the last-listed one and prune. This is where index bookkeeping bugs live.
    function wardrobe(uint256 a, uint256 c, uint256 s) external {
        _count("wardrobe");
        address actor = _actor(a);
        uint256 n = game.balanceOf(actor);
        if (n == 0) return;
        uint256 cat = game.tokenOfOwnerByIndex(actor, c % n);
        bytes32 k = gk(cat, actor);
        s = bound(s, 0, 1e9);
        _stock(actor, s);
        _stock(actor, s + 1);
        _stock(actor, s + 2);
        uint256[] memory held = _heldEquippables(actor, 3);
        if (held.length < 3) return;
        for (uint256 j = 0; j < 3; j++) {
            if (ghostOn[k][held[j]]) return; // start from a clean slate for these three
        }
        if (ghostList[k].length + 3 > items.MAX_EQUIPPED()) return;
        _count("wardrobeOk");
        vm.startPrank(actor);
        for (uint256 j = 0; j < 3; j++) {
            items.equip(address(game), cat, held[j]);
            _ghostPush(k, held[j]);
            _check(cat, actor);
        }
        items.unequip(address(game), cat, held[0]);
        _ghostRemove(k, held[0]);
        _check(cat, actor); // the last entry moved into slot 0
        items.equip(address(game), cat, held[0]);
        _ghostPush(k, held[0]);
        _check(cat, actor); // back on after removal
        items.unequip(address(game), cat, held[2]);
        _ghostRemove(k, held[2]);
        _check(cat, actor); // the moved one comes off
        uint256 bal = items.balanceOf(actor, held[0]);
        items.safeTransferFrom(actor, _actor(s), held[0], bal, ""); // sell every copy of a non-last entry
        vm.stopPrank();
        items.prune(address(game), cat); // the last entry moves into its slot
        _ghostPrune(k, actor);
        _check(cat, actor);
        vm.prank(actor);
        items.unequip(address(game), cat, held[1]); // the moved entry must still be findable by index
        _ghostRemove(k, held[1]);
        _check(cat, actor);
    }

    /// @dev A former owner cannot touch the list they left behind while someone else owns the cat.
    function formerOwnerUnequips(uint256 a, uint256 c, uint256 s, uint256 b) external {
        _count("formerOwner");
        address actor = _actor(a);
        uint256 n = game.balanceOf(actor);
        if (n == 0) return;
        uint256 cat = game.tokenOfOwnerByIndex(actor, c % n);
        bytes32 k = gk(cat, actor);
        _stock(actor, s);
        uint256[] memory held = _heldEquippables(actor, 1);
        if (held.length == 0) return;
        address buyer = _actor(b);
        if (buyer == actor) return;
        vm.startPrank(actor);
        items.equip(address(game), cat, held[0]);
        if (!ghostOn[k][held[0]]) _ghostPush(k, held[0]);
        game.transferFrom(actor, buyer, cat);
        try items.unequip(address(game), cat, held[0]) {
            revert("model: former owner unequipped");
        } catch {}
        try items.equip(address(game), cat, held[0]) {
            revert("model: former owner equipped");
        } catch {}
        vm.stopPrank();
        require(
            items.equipped(address(game), cat).length == ghostVisible(cat, buyer), "model: buyer sees a stranger's list"
        );
    }

    function ghostVisible(uint256 cat, address owner) public view returns (uint256 n) {
        uint256[] storage l = ghostList[gk(cat, owner)];
        for (uint256 i = 0; i < l.length; i++) {
            if (items.balanceOf(owner, l[i]) > 0) n++;
        }
    }

    function _heldEquippables(address actor, uint256 want) internal view returns (uint256[] memory out) {
        uint256 total = items.itemCount();
        uint256[] memory tmp = new uint256[](total);
        uint256 k;
        for (uint256 id = 1; id <= total && k < want; id++) {
            if (items.balanceOf(actor, id) > 0 && items.item(id).kind != EmogotchiItems.Kind.Consumable) tmp[k++] = id;
        }
        out = new uint256[](k);
        for (uint256 i = 0; i < k; i++) {
            out[i] = tmp[i];
        }
    }

    function _ghostPush(bytes32 k, uint256 id) internal {
        ghostList[k].push(id);
        ghostOn[k][id] = true;
    }

    function _ghostPrune(bytes32 key, address owner) internal {
        uint256[] storage list = ghostList[key];
        for (uint256 k = list.length; k > 0; k--) {
            uint256 id = list[k - 1];
            if (items.balanceOf(owner, id) > 0) continue;
            list[k - 1] = list[list.length - 1];
            list.pop();
            ghostOn[key][id] = false;
        }
    }

    /// @dev equipped() must equal the mirror filtered by what the owner holds, in order.
    function _check(uint256 cat, address owner) internal view {
        uint256[] memory out = items.equipped(address(game), cat);
        uint256[] storage l = ghostList[gk(cat, owner)];
        uint256 j;
        for (uint256 i = 0; i < l.length; i++) {
            if (items.balanceOf(owner, l[i]) == 0) continue;
            require(j < out.length && out[j] == l[i], "model: equipped() differs from the mirror");
            j++;
        }
        require(j == out.length, "model: equipped() longer than the mirror");
    }

    /// @dev The pool's WMON balance goes to zero while the quote still works: the depth guard alone
    ///      must call the path broken.
    function poolDrain(bool drained) external {
        _count("poolDrain");
        nad.setPoolBalance(drained ? 0 : nad.monReserve());
    }

    // ---------------------------------------------------------------- the cats
    function catTransfer(uint256 c, uint256 b) external {
        _count("catTransfer");
        uint256 cat = _cat(c);
        address owner = game.ownerOf(cat);
        vm.prank(owner);
        game.transferFrom(owner, _actor(b), cat);
    }

    function nameCat(uint256 c) external {
        _count("nameCat");
        uint256 cat = _cat(c);
        address owner = game.ownerOf(cat);
        vm.prank(owner);
        try game.setName{value: 10 ether}(cat, "Zed") {
            spent[owner] += 10 ether;
        } catch {}
    }

    // ---------------------------------------------------------------- money
    /// @dev What the mock says about the path, computed without asking the contract.
    function _pathBroken() internal view returns (bool) {
        return nad.lensRouter() != address(nad) || nad.monReserve() == 0 || nad.emoReserve() == 0
            || nad.wmon().balanceOf(nad.pool()) == 0;
    }

    function crank(uint256 maxMon, uint256 minOut, bool newBlock) external {
        _count("crank");
        if (newBlock) vm.roll(block.number + 1);
        bool blocked = items.lastBurnBlock() == block.number;
        maxMon = bound(maxMon, 1, 100 ether);
        minOut = bound(minOut, 0, 1);
        require(items.swapPathBroken() == _pathBroken(), "model: swapPathBroken disagrees with the mock");
        uint256 pb = items.pendingBurnMon();
        uint256 nb = address(nad).balance;
        uint256 tb = items.totalMonBurned();
        uint256 amt = pb < maxMon ? pb : maxMon;
        uint256 cap = (nad.wmon().balanceOf(nad.pool()) * items.MAX_IMPACT_BPS()) / items.BPS();
        if (amt > cap) amt = cap;
        if (blocked) amt = 0; // a second crank in the same block does nothing
        bool expectBurn = amt > 0 && !nad.failNext() && !_pathBroken();
        uint256 quoted = nad.quoteOut(amt);
        uint256 floor = (quoted * (items.BPS() - items.MAX_IMPACT_BPS())) / items.BPS();
        try items.crankBurn(maxMon, minOut) {
            require(amt > 0, "model: crank of nothing");
            uint256 d = address(nad).balance - nb;
            if (d > 0) _count("crankBurned");
            else _count("crankQueued");
            require(d == (expectBurn ? amt : 0), "model: burned when it should queue, or queued when it should burn");
            if (d > 0) {
                require(nad.lastMinOut() >= floor && nad.lastMinOut() >= minOut, "model: slippage floor too low");
                require(items.brokenSince() == 0, "model: a burn must clear brokenSince");
            }
            require(items.pendingBurnMon() == pb - d, "model: pending after crank");
            require(items.totalMonBurned() == tb + d, "model: totalMonBurned after crank");
            burnedRouter += d;
        } catch {
            require(amt == 0, "model: crank should have worked");
        }
    }

    function fallbackCrank(uint256 maxMon) external {
        _count("fallback");
        maxMon = bound(maxMon, 1, 100 ether);
        uint256 pb = items.pendingBurnMon();
        uint256 amt = pb < maxMon ? pb : maxMon;
        uint256 since = items.brokenSince();
        uint256 tb = items.totalMonBurned();
        require(items.swapPathBroken() == _pathBroken(), "model: swapPathBroken disagrees with the mock");
        bool ok = _pathBroken() && amt > 0 && since != 0 && vm.getBlockTimestamp() >= since + items.FALLBACK_DELAY();
        uint256 dead = items.BURN_ADDRESS().balance;
        try items.crankFallback(maxMon) {
            require(ok, "model: fallback should have failed");
            _count("fallbackOk");
            require(items.BURN_ADDRESS().balance == dead + amt, "model: fallback amount");
            require(items.pendingBurnMon() == pb - amt, "model: pending after fallback");
            require(items.totalMonBurned() == tb + amt, "model: totalMonBurned after fallback");
            burnedFallback += amt;
        } catch {
            require(!ok, "model: fallback should have worked");
        }
    }

    function notePath() external {
        _count("notePath");
        uint256 since = items.brokenSince();
        bool broken = items.swapPathBroken();
        require(broken == _pathBroken(), "model: swapPathBroken disagrees with the mock");
        items.noteSwapPath();
        if (!broken) {
            require(items.brokenSince() == 0, "model: note should clear");
        } else {
            require(items.brokenSince() == (since == 0 ? vm.getBlockTimestamp() : since), "model: note should start");
        }
    }

    function sweep() external {
        _count("sweep");
        uint256 t = items.treasuryOwed();
        uint256 m = items.teamOwed();
        uint256 tb = treasury.balance;
        uint256 mb = team.balance;
        try items.sweep() {
            require(t + m > 0, "model: swept nothing");
            require(treasury.balance == tb + t && team.balance == mb + m, "model: sweep amounts");
            sweptT += t;
            sweptM += m;
        } catch {
            require(t + m == 0, "model: sweep should have worked");
        }
    }

    function skim() external {
        _count("skim");
        uint256 excess = address(items).balance - (items.pendingBurnMon() + items.treasuryOwed() + items.teamOwed());
        try items.skim() {
            require(excess > 0, "model: skimmed nothing");
            skimmed += excess;
        } catch {
            require(excess == 0, "model: skim should have worked");
        }
    }

    function donate(uint256 amount) external {
        _count("donate");
        amount = bound(amount, 1, 5 ether);
        vm.deal(address(this), amount);
        (bool ok,) = address(items).call{value: amount}("");
        require(ok, "donate failed");
        donated += amount;
    }

    // ---------------------------------------------------------------- the world
    function warp(uint256 d) external {
        _count("warp");
        vm.warp(vm.getBlockTimestamp() + (d % 8 == 0 ? 7 days + 1 : bound(d, 0, 3 days)));
    }

    /// @dev The full fallback story in one call: the pool empties, someone notes it, a week passes.
    function outage() external {
        _count("outage");
        nad.setReserves(0, 42_000_000 ether);
        items.noteSwapPath();
        vm.warp(vm.getBlockTimestamp() + 7 days + 1);
    }

    function flipLens(bool sane) external {
        _count("flipLens");
        nad.setLensRouter(sane ? address(nad) : address(0xBEEF));
    }

    function routerFails(bool f) external {
        _count("routerFails");
        nad.setFailNext(f);
    }

    function setDepth(uint256 mon) external {
        _count("setDepth");
        // 0 empties the pool, which counts as a broken path
        nad.setReserves(mon % 5 == 0 ? 0 : bound(mon, 1 ether, 50_000 ether), 42_000_000 ether);
    }
}

contract ItemsInvariant is Test {
    Emogotchi game;
    EmogotchiItems items;
    NamedCatGate named;
    HoldsGate holds;
    MockEMO emo;
    MockWMON wmon;
    MockNad nad;
    ItemsHandler h;
    address pool = address(0x900D);
    address treasury = makeAddr("treasury");
    address team = makeAddr("team");
    address[] actors;
    uint256 constant CATS = 14; // 12 across the four EOAs, 2 for the contract wallet
    bytes svg = bytes('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><circle r="4"/></svg>');

    function setUp() public {
        emo = new MockEMO();
        wmon = new MockWMON();
        nad = new MockNad(emo, wmon, pool, 10_000 ether, 42_000_000 ether);
        Emogotchi.Params memory p;
        p.minter = address(this);
        p.maxSupply = 1000;
        p.welcome = 7 days;
        p.treasury = treasury;
        p.team = team;
        p.burnBps = 8000;
        p.treasuryBps = 1000;
        p.teamBps = 1000;
        p.reviveBurnBps = 5000;
        p.emo = address(emo);
        p.wmon = address(wmon);
        p.router = address(nad);
        p.lens = address(nad);
        p.pool = pool;
        p.maxImpactBps = 50;
        p.art = address(new MockArt());
        p.siteURI = "https://emogotchi.emonad.lol";
        game = new Emogotchi(p);

        EmogotchiItems.Params memory q;
        q.curator = address(this);
        q.treasury = treasury;
        q.team = team;
        q.treasuryBps = 1000;
        q.teamBps = 1000;
        q.emo = address(emo);
        q.wmon = address(wmon);
        q.router = address(nad);
        q.lens = address(nad);
        q.pool = pool;
        q.maxImpactBps = 50;
        q.collectionSvg = svg;
        items = new EmogotchiItems(q);
        named = new NamedCatGate(address(game));
        holds = new HoldsGate(address(game), 2);
        items.allowCollection(address(game));

        for (uint256 i = 0; i < 4; i++) {
            address a = makeAddr(string.concat("actor", vm.toString(i)));
            actors.push(a);
            vm.deal(a, 10_000 ether);
            game.mintMany(a, 3);
        }
        address rw = address(new ReceiverWallet());
        actors.push(rw);
        vm.deal(rw, 10_000 ether);
        game.mintMany(rw, 2);
        vm.prank(actors[0]);
        game.setName{value: 10 ether}(1, "Salem");
        vm.deal(actors[0], 10_000 ether); // the model counts from here

        // a spread of rules: the witch, a paid scene, a soulbound consumable, a windowed cosmetic, a gated passive
        EmogotchiItems.CreateParams memory c;
        c.name = "Witch outfit";
        c.description = "hat and robe";
        c.svg = svg;
        c.maxSupply = 1000;
        c.perKey = 1;
        c.kind = EmogotchiItems.Kind.Cosmetic;
        c.slot = 1;
        c.gate = address(named);
        items.create(c);

        c = _blank("Neon room");
        c.price = 1 ether;
        c.maxSupply = 50;
        c.kind = EmogotchiItems.Kind.Scene;
        c.slot = 3;
        items.create(c);

        c = _blank("Fish snack");
        c.kind = EmogotchiItems.Kind.Consumable;
        c.soulbound = true;
        items.create(c);

        c = _blank("Party hat");
        c.price = 0.5 ether;
        c.opens = uint64(block.timestamp + 1 days);
        c.closes = uint64(block.timestamp + 3 days);
        c.kind = EmogotchiItems.Kind.Cosmetic;
        c.slot = 2;
        items.create(c);

        c = _blank("Autofeeder ticket");
        c.price = 2 ether;
        c.maxSupply = 10;
        c.perKey = 2;
        c.kind = EmogotchiItems.Kind.Passive;
        c.gate = address(holds);
        items.create(c);

        c = _blank("Bow");
        c.kind = EmogotchiItems.Kind.Cosmetic;
        c.slot = 2;
        items.create(c);
        c = _blank("Scarf");
        c.kind = EmogotchiItems.Kind.Cosmetic;
        c.slot = 2;
        items.create(c);
        c = _blank("Lamp");
        c.kind = EmogotchiItems.Kind.Scene;
        c.slot = 4;
        items.create(c);

        h = new ItemsHandler(game, items, named, holds, nad, treasury, team, actors, CATS);
        items.setCurator(address(h)); // an offer; the handler takes it
        vm.prank(address(h));
        items.acceptCurator();
        targetContract(address(h));
    }

    function _blank(string memory name) internal view returns (EmogotchiItems.CreateParams memory c) {
        c.name = name;
        c.description = "fuzz";
        c.svg = svg;
    }

    // every copy that exists is in an actor's wallet: sum of balances == minted - consumed
    function invariant_supply() public view {
        for (uint256 id = 1; id <= items.itemCount(); id++) {
            EmogotchiItems.Item memory it = items.item(id);
            uint256 sum;
            for (uint256 a = 0; a < actors.length; a++) {
                sum += items.balanceOf(actors[a], id);
            }
            assertEq(items.balanceOf(h.nonReceiver(), id), 0, "a wallet without the hook got items");
            assertEq(sum + h.consumed(id), it.minted, "balances vs minted");
            assertEq(items.burned(id), h.consumed(id), "burned counter");
            assertEq(items.totalSupply(id), sum, "totalSupply");
            if (it.maxSupply != 0) assertLe(it.minted, it.maxSupply, "over max supply");
            if (h.sealedGhost(id)) {
                assertTrue(it.isSealed, "seal lost");
                assertEq(it.minted, h.sealedMinted(id), "minted after seal");
            }
            uint256 rem = items.remaining(id);
            if (it.isSealed) assertEq(rem, 0, "remaining of sealed");
            else if (it.maxSupply != 0) assertEq(rem, it.maxSupply - it.minted, "remaining");
            else assertEq(rem, type(uint256).max, "remaining of unlimited");
        }
    }

    // an item's rules never change after creation
    function invariant_rulesFrozen() public view {
        for (uint256 id = 1; id <= items.itemCount(); id++) {
            EmogotchiItems.Item memory it = items.item(id);
            (
                uint128 price,
                uint32 maxSupply,
                uint32 perKey,,
                uint64 opens,
                uint64 closes,
                EmogotchiItems.Kind kind,
                uint8 slot,
                bool soulbound,,
                address gate,
                address art,
                string memory name,
                string memory description
            ) = h.snap(id);
            assertEq(it.price, price, "price changed");
            assertEq(it.maxSupply, maxSupply, "maxSupply changed");
            assertEq(it.perKey, perKey, "perKey changed");
            assertEq(it.opens, opens, "opens changed");
            assertEq(it.closes, closes, "closes changed");
            assertEq(uint8(it.kind), uint8(kind), "kind changed");
            assertEq(it.slot, slot, "slot changed");
            assertEq(it.soulbound, soulbound, "soulbound changed");
            assertEq(it.gate, gate, "gate changed");
            assertEq(it.art, art, "art changed");
            assertEq(it.name, name, "name changed");
            assertEq(it.description, description, "description changed");
        }
    }

    // nobody claims past their cap, whether the key is a wallet or a cat
    function invariant_perKey() public view {
        for (uint256 id = 1; id <= items.itemCount(); id++) {
            uint32 cap = items.item(id).perKey;
            for (uint256 a = 0; a < actors.length; a++) {
                bytes32 k = bytes32(uint256(uint160(actors[a])));
                assertEq(items.claimedBy(id, k), h.claimedGhost(id, k), "claimedBy drifts from the claims made");
                if (cap != 0) assertLe(h.claimedGhost(id, k), cap, "per-wallet cap");
            }
            for (uint256 cat = 1; cat <= CATS; cat++) {
                assertEq(items.claimedBy(id, bytes32(cat)), h.claimedGhost(id, bytes32(cat)), "claimedBy drifts (cat)");
                if (cap != 0) assertLe(h.claimedGhost(id, bytes32(cat)), cap, "per-cat cap");
            }
        }
    }

    // every wei is accounted for; the contract always covers what it owes
    function invariant_money() public view {
        uint256 tracked = items.pendingBurnMon() + items.treasuryOwed() + items.teamOwed();
        uint256 bal = address(items).balance;
        assertGe(bal, tracked, "insolvent");
        uint256 burned = h.burnedRouter() + h.burnedFallback();
        uint256 swept = h.sweptT() + h.sweptM();
        assertEq(bal, h.paid() + h.donated() - burned - swept, "balance conservation");
        assertEq(tracked, h.paid() + h.skimmed() - burned - swept, "tracked conservation");
        assertEq(bal - tracked, h.donated() - h.skimmed(), "untracked is just unskimmed donations");
        assertEq(items.totalMonBurned(), burned, "totalMonBurned");
        assertEq(treasury.balance, h.sweptT(), "treasury got exactly what was swept");
        assertEq(team.balance, h.sweptM(), "team got exactly what was swept");
        // the split itself: what is owed is 10/10 of the paid MON that is not yet swept
        assertEq(items.treasuryOwed() + h.sweptT(), h.shareT(), "treasury share");
        assertEq(items.teamOwed() + h.sweptM(), h.shareM(), "team share");
        assertEq(items.pendingBurnMon() + burned, h.shareB() + h.skimmed(), "burn share");
        assertEq(h.shareT() + h.shareM() + h.shareB(), h.paid(), "split sums to what was paid");
    }

    // the shop never pays a player
    function invariant_actorsNeverGain() public view {
        for (uint256 a = 0; a < actors.length; a++) {
            assertEq(actors[a].balance + h.spent(actors[a]), h.START(), "actor balance");
        }
    }

    // equipped() is exactly the current owner's mirrored list filtered by what they hold, with sane
    // entries; and every other actor's list for that cat is invisible while they do not own it
    function invariant_equipped() public view {
        for (uint256 cat = 1; cat <= CATS; cat++) {
            address owner = game.ownerOf(cat);
            for (uint256 a = 0; a < actors.length; a++) {
                if (actors[a] == owner) continue;
                if (h.ghostLength(cat, actors[a]) == 0) continue;
                // a former owner's outfit must not show while they do not own the cat
                uint256[] memory shown = items.equipped(address(game), cat);
                for (uint256 i = 0; i < shown.length; i++) {
                    assertGt(items.balanceOf(owner, shown[i]), 0, "shown item not held by the owner");
                }
            }
            uint256[] memory out = items.equipped(address(game), cat);
            uint256 n = h.ghostLength(cat, owner);
            assertLe(n, items.MAX_EQUIPPED(), "ghost list too long");
            uint256 expect;
            uint256 k;
            for (uint256 i = 0; i < n; i++) {
                uint256 id = h.ghostAt(cat, owner, i);
                if (items.balanceOf(owner, id) == 0) continue;
                expect++;
                assertLt(k, out.length, "equipped shorter than the model");
                assertEq(out[k++], id, "equipped order");
            }
            assertEq(out.length, expect, "equipped length");
            for (uint256 i = 0; i < out.length; i++) {
                assertTrue(items.item(out[i]).kind != EmogotchiItems.Kind.Consumable, "kind");
                assertGt(items.balanceOf(owner, out[i]), 0, "owner holds it");
                for (uint256 j = i + 1; j < out.length; j++) {
                    assertTrue(out[i] != out[j], "duplicate");
                }
            }
        }
    }

    // the curator's role is exactly where it was put
    function invariant_curator() public view {
        assertEq(items.curator(), address(h), "curator");
    }

    // what the fuzzer actually exercised, shown with -vv
    function afterInvariant() public view {
        string[37] memory names = [
            "claim",
            "claimOk",
            "grant",
            "seal",
            "create",
            "transfer",
            "batch",
            "consume",
            "use",
            "approve",
            "equip",
            "equipOk",
            "equipStrange",
            "unequip",
            "prune",
            "catTransfer",
            "nameCat",
            "crank",
            "crankBurned",
            "crankQueued",
            "fallback",
            "fallbackOk",
            "notePath",
            "sweep",
            "skim",
            "donate",
            "warp",
            "unequipOk",
            "toContract",
            "stranger",
            "curatorOffer",
            "outage",
            "stockOk",
            "wardrobe",
            "wardrobeOk",
            "formerOwner",
            "poolDrain"
        ];
        for (uint256 i = 0; i < names.length; i++) {
            console2.log(names[i], h.calls(bytes32(bytes(names[i]))));
        }
        console2.log("items", items.itemCount());
    }
}
