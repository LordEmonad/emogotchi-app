// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

/// @dev The two minter calls on Emogotchi, plus the supply views the claim page shows.
interface IEmogotchiMint {
    function mint(address[] calldata to) external;
    function mintMany(address to, uint256 count) external;
    function totalSupply() external view returns (uint256);
    function MAX_SUPPLY() external view returns (uint256);
}

/**
 * @title EmogotchiDrop
 * @notice The only minter of Emogotchi. Two ways a cat comes into the world, and then never again:
 *
 *   1. The airdrop: the operator pushes batches to the snapshot list (`airdrop`).
 *   2. The claim: wallets on a Merkle allowlist mint one cat each, during one window (`claim`).
 *
 * `seal()` ends everything for good. Anyone can call it once the claim window has closed, so the
 * supply is final by the rules and not by anyone's goodwill. Unclaimed cats are never minted.
 *
 * The operator has no power over the game itself; the game contract has no owner. Here the operator
 * can only: push cats to addresses (up to MAX_SUPPLY, enforced by the game), open the claim window
 * once, and seal early.
 */
contract EmogotchiDrop {
    IEmogotchiMint public immutable GAME;
    address public immutable OPERATOR;

    bytes32 public root; // Merkle root of the allowlist; zero until claims open
    uint64 public claimStart;
    uint64 public claimEnd;
    uint256 public claimCap; // most cats the claim window may mint
    uint256 public claimed; // cats minted through claim()
    uint256 public airdropped; // cats minted through airdrop()
    mapping(address => bool) public hasClaimed;
    bool public isSealed;

    event Airdropped(uint256 count, uint256 total);
    event ClaimsOpened(bytes32 root, uint64 start, uint64 end, uint256 cap);
    event Claimed(address indexed to, uint256 indexed id);
    event Sealed(uint256 finalSupply);

    error NotOperator();
    error IsSealed();
    error ClaimsNotOpen();
    error ClaimsClosed();
    error AlreadyClaimed();
    error NotOnTheList();
    error NoCatsLeft();
    error AlreadyOpened();
    error BadWindow();
    error TooEarlyToSeal();

    constructor(address game, address operator) {
        if (game == address(0) || operator == address(0)) revert BadWindow();
        GAME = IEmogotchiMint(game);
        OPERATOR = operator;
    }

    modifier onlyOperator() {
        if (msg.sender != OPERATOR) revert NotOperator();
        _;
    }

    // ---------------------------------------------------------------- airdrop
    /// @notice Mint one cat to each address. Batches of a few hundred fit a Monad transaction.
    function airdrop(address[] calldata to) external onlyOperator {
        if (isSealed) revert IsSealed();
        GAME.mint(to);
        airdropped += to.length;
        emit Airdropped(to.length, airdropped);
    }

    // ---------------------------------------------------------------- claim window
    /// @notice Publish the allowlist and the window. Once.
    function openClaims(bytes32 root_, uint64 start, uint64 end, uint256 cap) external onlyOperator {
        if (isSealed) revert IsSealed();
        if (root != bytes32(0)) revert AlreadyOpened();
        if (root_ == bytes32(0) || start >= end || end <= block.timestamp || cap == 0) revert BadWindow();
        root = root_;
        claimStart = start;
        claimEnd = end;
        claimCap = cap;
        emit ClaimsOpened(root_, start, end, cap);
    }

    /// @notice One cat for the caller, if the caller is on the list and the window is open.
    function claim(bytes32[] calldata proof) external returns (uint256 id) {
        if (isSealed) revert IsSealed();
        if (root == bytes32(0) || block.timestamp < claimStart) revert ClaimsNotOpen();
        if (block.timestamp >= claimEnd) revert ClaimsClosed();
        if (hasClaimed[msg.sender]) revert AlreadyClaimed();
        if (!_onTheList(proof, msg.sender)) revert NotOnTheList();
        if (claimed >= claimCap) revert NoCatsLeft();
        hasClaimed[msg.sender] = true;
        claimed += 1;
        GAME.mintMany(msg.sender, 1); // the game enforces MAX_SUPPLY
        id = GAME.totalSupply(); // ids are sequential, the newest cat is the last one
        emit Claimed(msg.sender, id);
    }

    /// @notice Is this wallet on the list? (the page checks before asking for a signature)
    function eligible(address wallet, bytes32[] calldata proof) external view returns (bool) {
        return root != bytes32(0) && _onTheList(proof, wallet);
    }

    /// @notice Cats the claim window can still mint: the cap, or the game's supply, whichever bites first.
    function claimsLeft() external view returns (uint256) {
        if (isSealed || root == bytes32(0)) return 0;
        uint256 byCap = claimCap > claimed ? claimCap - claimed : 0;
        uint256 bySupply = GAME.MAX_SUPPLY() - GAME.totalSupply();
        return byCap < bySupply ? byCap : bySupply;
    }

    // ---------------------------------------------------------------- the end
    /// @notice No more cats, ever. The operator any time; anyone once the window has closed.
    function seal() external {
        if (isSealed) revert IsSealed();
        if (msg.sender != OPERATOR) {
            if (root == bytes32(0) || block.timestamp < claimEnd) revert TooEarlyToSeal();
        }
        isSealed = true;
        emit Sealed(GAME.totalSupply());
    }

    // ---------------------------------------------------------------- merkle
    /// @dev leaf = keccak256(bytes.concat(keccak256(abi.encode(wallet)))), pairs hashed in sorted order.
    function _onTheList(bytes32[] calldata proof, address wallet) private view returns (bool) {
        bytes32 h = keccak256(bytes.concat(keccak256(abi.encode(wallet))));
        for (uint256 i = 0; i < proof.length; i++) {
            bytes32 p = proof[i];
            h = h < p ? keccak256(abi.encodePacked(h, p)) : keccak256(abi.encodePacked(p, h));
        }
        return h == root;
    }
}
