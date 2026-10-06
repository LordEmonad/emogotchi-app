// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {IEntropyV2} from "./IEntropyV2.sol";
import {IEntropyConsumer} from "./IEntropyConsumer.sol";

/**
 * @title  FightClub
 * @notice Emogotchi Fight Club: two owners stake the same MON on their pets and a coin flip from Pyth Entropy decides
 *         the fight. The winner takes the pot minus 5%; the 5% goes to the team. Any pet fights any pet: a cat, an
 *         inversebrah or a Tung Tung Tung Sahur, across species. Pure 50/50: care, crowns and outfits do not change
 *         the odds. Pets are never at stake; the loser's pet wears a black eye for a day, the winner's a belt.
 *
 *         No owner, no admin, no pause, no upgrade, no selfdestruct. MON leaves only to a fighter (a win or a refund),
 *         to someone this contract owes (who takes it with `withdraw`), or to the fixed TEAM address (`sweep`). The
 *         one exception is the Entropy fee the acceptor pays, which passes straight through to Pyth in `accept`.
 *
 *         The flow:
 *         1. `challenge(collection, tokenId, opponent)` with the stake as the value. The sender owns the pet; a pet is
 *            in at most one open or pending fight; `opponent` 0 is open to anyone, else only that wallet may accept.
 *         2. `cancel(id)`: the challenger at any time while open; anyone once CHALLENGE_TTL has passed, or once the
 *            challenger no longer owns the pet. The stake goes back to the challenger.
 *         3. `accept(id, collection, tokenId)` with the same stake plus the Entropy fee (`quote()`); any excess is
 *            refunded. Randomness is requested from Pyth and the fight is pending.
 *         4. Pyth calls back (`_entropyCallback`): random % 2 == 0, the challenger wins, else the acceptor. The winner
 *            is paid 2 x stake minus FEE_BPS by a push with a gas cap; a push that fails is credited to `owed` for
 *            `withdraw`, so no wallet can block a fight. The team's cut accrues for `sweep`.
 *         5. `abort(id)`: if Pyth has not answered ENTROPY_TIMEOUT (a day) after the accept, anyone may call the fight off:
 *            both stakes go back to the two fighters.
 *
 *         Money invariant: address(this).balance == openStakes + pendingStakes + totalOwed + teamOwed, always (plus
 *         anything forced in by a selfdestruct, which nothing here can spend). There is no receive(): plain MON sent
 *         here reverts.
 *
 *         The callback never reverts for a pending fight, whatever the context it is run in: Pyth runs it with a fixed
 *         gas limit and, if it reverts, publishes the random number and waits for someone to retry, which would give
 *         the loser a window to `abort`. So it does a fixed amount of work, pays with a capped push, and takes the
 *         reentrancy lock only if it is free (anyone holding a revelation from Pyth's public API can trigger it, even
 *         from inside a payout of this contract).
 */
contract FightClub is IEntropyConsumer {
    // ---------------------------------------------------------------- types
    enum Status {
        None,
        Open, // a challenge waiting for an acceptor
        Cancelled, // withdrawn or expired before anyone accepted
        Pending, // accepted, waiting for Pyth
        Fought, // decided; the winner is paid or owed
        Aborted // Pyth did not answer in time; both stakes refunded
    }

    /// @dev One record per challenge, kept for ever: an open challenge becomes a pending fight when accepted, then a
    ///      fought or aborted one. Collections are stored as 1 (cat), 2 (frok), 3 (Sahur).
    struct Fight {
        // slot 0
        address challenger;
        uint96 stake; // wei a side, MIN_STAKE..MAX_STAKE
        // slot 1
        address opponent; // 0 = anyone
        uint40 createdAt;
        uint8 colA; // the challenger's pet
        uint8 colB; // the acceptor's pet
        Status status;
        // slot 2
        address acceptor;
        uint64 sequence; // Pyth's sequence number
        // slot 3
        uint256 petA;
        // slot 4
        uint256 petB;
        // slot 5
        address provider; // Pyth's provider for this request
        uint40 acceptedAt;
        uint40 foughtAt;
        // slot 6
        bytes32 random; // Pyth's random number, once fought
    }

    /// @dev A pet's fight record, kept per (collection, tokenId): it travels with the pet.
    struct Record {
        uint32 wins;
        uint32 losses;
        uint40 lastAt; // when its last fight was decided, 0 = never fought
        bool lastWon;
        uint64 lastFight; // the id of that fight
    }

    /// @notice Everything about one challenge or fight, for the site.
    struct FightView {
        uint256 id;
        Status status;
        address challenger;
        address challengerCollection;
        uint256 challengerPet;
        address opponent; // 0 = open to anyone
        uint256 stake; // a side
        uint256 createdAt;
        uint256 expiresAt; // createdAt + CHALLENGE_TTL: no accept from then, and anyone may cancel it
        address acceptor; // 0 until accepted
        address acceptorCollection;
        uint256 acceptorPet;
        uint256 acceptedAt;
        uint256 abortableAt; // acceptedAt + ENTROPY_TIMEOUT, 0 until accepted
        address provider;
        uint64 sequence;
        bytes32 random; // 0 until fought
        uint256 foughtAt;
        address winner; // 0 until fought
        uint256 payout; // what the winner gets: 2 x stake minus the team's cut
    }

    /// @notice The looks a pet wears now because of its last fight. Each is the time it comes off, 0 if not worn now.
    struct Look {
        uint256 beltUntil;
        uint256 blackEyeUntil;
    }

    // ---------------------------------------------------------------- constants
    uint256 public constant MIN_STAKE = 1 ether;
    uint256 public constant MAX_STAKE = 1_000 ether;
    /// @dev The team's share of the pot (2 x stake), in basis points.
    uint256 public constant FEE_BPS = 500;
    uint256 private constant BPS = 10_000;
    uint256 public constant CHALLENGE_TTL = 24 hours;
    /// @dev A day, not an hour (Ultrafuzz, 2026-09-29): once Pyth's revelation for a request is public (Fortuna serves it
    ///      before its keeper lands the reveal), a loser could race an `abort` against a keeper running late. Anyone may
    ///      reveal through Entropy (the winner has every reason to), so a day makes that race need Pyth down a whole day.
    uint256 public constant ENTROPY_TIMEOUT = 24 hours;
    uint256 public constant LOOK_FOR = 24 hours;
    /// @dev The gas Pyth gives the callback. Measured on the real Monad node (eth_estimateGas with a state override,
    ///      2026-09-28): ~173k when the winner is a wallet, ~254k in the worst case (the winner burns all PUSH_GAS and
    ///      is credited instead); ~111k on forge's EVM schedule. 1,000,000 is ~3.9x the worst case, and it is the Monad
    ///      provider's own default, so today it costs nothing over the minimum fee (Pyth raises any smaller limit to the
    ///      default anyway). See src/fightclub/README.md.
    uint32 public constant CALLBACK_GAS = 1_000_000;
    /// @dev The gas a payout push forwards. Enough for any wallet's receive (an EOA needs none; a Safe or a 7702
    ///      delegate a few thousand); a wallet that wants more is credited instead and withdraws.
    uint256 public constant PUSH_GAS = 50_000;

    uint8 private constant BY_CHALLENGER = 0;
    uint8 private constant EXPIRED = 1;
    uint8 private constant PET_GONE = 2;
    uint8 private constant PET_DEAD = 3;

    // ---------------------------------------------------------------- immutables
    IEntropyV2 public immutable ENTROPY;
    address public immutable TEAM;
    address public immutable CAT;
    address public immutable FROK;
    address public immutable SAHUR;

    // ---------------------------------------------------------------- storage
    uint256 public fightCount;
    mapping(uint256 => Fight) private _fights;
    /// @dev keccak256(provider, sequence) => fight id.
    mapping(bytes32 => uint256) private _byRequest;
    /// @dev The ids of open challenges, swap-remove; `_openAt` is index + 1.
    uint256[] private _open;
    mapping(uint256 => uint256) private _openAt;
    /// @notice collection => tokenId => the id of the open or pending fight the pet is in, 0 = free.
    mapping(address => mapping(uint256 => uint256)) public activeFightOf;
    mapping(address => mapping(uint256 => Record)) private _records;
    /// @dev Every fight a wallet made or accepted, in order.
    mapping(address => uint256[]) private _fightsOf;
    /// @notice MON this contract owes a wallet because a push to it failed; taken with `withdraw`.
    mapping(address => uint256) public owed;

    uint128 public openStakes; // sum of the stakes of open challenges
    uint128 public pendingStakes; // sum of both stakes of pending fights
    uint128 public totalOwed; // sum of `owed`
    uint128 public teamOwed; // the team's cut, not yet swept
    uint256 private _lock = 1;

    // ---------------------------------------------------------------- events
    event ChallengeMade(
        uint256 indexed id,
        address indexed challenger,
        address indexed opponent,
        address collection,
        uint256 tokenId,
        uint256 stake,
        uint256 expiresAt
    );
    /// @dev reason: 0 by the challenger, 1 expired, 2 the challenger no longer owns the pet, 3 the challenger's pet has died
    event ChallengeCancelled(uint256 indexed id, address indexed by, uint8 reason);
    event ChallengeAccepted(
        uint256 indexed id,
        address indexed acceptor,
        address collection,
        uint256 tokenId,
        address provider,
        uint64 sequence,
        uint256 entropyFee
    );
    event Fought(
        uint256 indexed id,
        address indexed winner,
        address indexed loser,
        address winnerCollection,
        uint256 winnerPet,
        address loserCollection,
        uint256 loserPet,
        uint256 stake,
        uint256 payout,
        uint256 teamCut,
        uint64 sequence,
        bytes32 random
    );
    event Aborted(uint256 indexed id, address indexed by);
    /// @dev A push that landed: a payout or a refund.
    event Paid(uint256 indexed id, address indexed to, uint256 amount);
    /// @dev A push that failed and is owed instead.
    event Credited(uint256 indexed id, address indexed to, uint256 amount);
    event Withdrawn(address indexed who, address indexed to, uint256 amount);
    event Swept(uint256 amount);

    // ---------------------------------------------------------------- errors
    error ZeroAddress();
    error DuplicateCollection();
    error Reentrancy();
    error CollectionNotAllowed(address collection);
    error StakeOutOfRange(uint256 stake);
    error BadOpponent();
    error NotOwner();
    error PetBusy(uint256 fightId);
    error NotOpen(uint256 id);
    error CannotCancel(uint256 id);
    error Expired(uint256 id);
    error OwnChallenge();
    error NotOpponent(address opponent);
    error ChallengerPetGone(uint256 id);
    error PetDead(address collection, uint256 tokenId);
    error ChallengerPetDead(uint256 id);
    error WrongValue(uint256 required, uint256 sent);
    error SequenceReused(uint64 sequence);
    error UnknownRequest(address provider, uint64 sequence);
    error NotPending(uint256 id);
    error TooEarly(uint256 at);
    error NothingOwed();
    error NothingToDo();
    error TransferFailed();
    error LengthMismatch();

    // ---------------------------------------------------------------- modifiers
    modifier nonReentrant() {
        if (_lock != 1) revert Reentrancy();
        _lock = 2;
        _;
        _lock = 1;
    }

    // ---------------------------------------------------------------- setup
    constructor(address entropy, address team, address cat, address frok, address sahur) {
        if (
            entropy == address(0) || team == address(0) || cat == address(0) || frok == address(0)
                || sahur == address(0)
        ) revert ZeroAddress();
        if (cat == frok || cat == sahur || frok == sahur) revert DuplicateCollection();
        ENTROPY = IEntropyV2(entropy);
        TEAM = team;
        CAT = cat;
        FROK = frok;
        SAHUR = sahur;
    }

    // ---------------------------------------------------------------- challenge
    /// @notice Challenge with your pet. The value is the stake, MIN_STAKE..MAX_STAKE, exactly. `opponent` 0 lets
    ///         anyone accept; any other address is the only wallet that may.
    function challenge(address collection, uint256 tokenId, address opponent)
        external
        payable
        nonReentrant
        returns (uint256 id)
    {
        uint8 col = _col(collection);
        uint256 stake = msg.value;
        if (stake < MIN_STAKE || stake > MAX_STAKE) revert StakeOutOfRange(stake);
        if (opponent == msg.sender) revert BadOpponent();
        if (_ownerOf(collection, tokenId) != msg.sender) revert NotOwner();
        if (!_alive(collection, tokenId, msg.sender)) revert PetDead(collection, tokenId);
        uint256 busy = activeFightOf[collection][tokenId];
        if (busy != 0) revert PetBusy(busy);

        id = ++fightCount;
        Fight storage f = _fights[id];
        f.challenger = msg.sender;
        f.stake = uint96(stake); // <= MAX_STAKE
        f.opponent = opponent;
        f.createdAt = uint40(block.timestamp);
        f.colA = col;
        f.status = Status.Open;
        f.petA = tokenId;

        activeFightOf[collection][tokenId] = id;
        _open.push(id);
        _openAt[id] = _open.length;
        _fightsOf[msg.sender].push(id);
        openStakes += uint128(stake);

        emit ChallengeMade(id, msg.sender, opponent, collection, tokenId, stake, block.timestamp + CHALLENGE_TTL);
    }

    /// @notice Withdraw an open challenge and refund its stake to the challenger. The challenger may at any time;
    ///         anyone may once it has expired, once the challenger no longer owns the pet, or once the pet has died.
    function cancel(uint256 id) external nonReentrant {
        Fight storage f = _fights[id];
        if (f.status != Status.Open) revert NotOpen(id);
        address challenger = f.challenger;
        address collection = _colAddr(f.colA);
        uint256 pet = f.petA;
        uint8 reason;
        if (msg.sender == challenger) {
            reason = BY_CHALLENGER;
        } else if (block.timestamp >= uint256(f.createdAt) + CHALLENGE_TTL) {
            reason = EXPIRED;
        } else if (_ownerOf(collection, pet) != challenger) {
            reason = PET_GONE;
        } else if (!_alive(collection, pet, challenger)) {
            reason = PET_DEAD;
        } else {
            revert CannotCancel(id);
        }
        uint256 stake = f.stake;

        f.status = Status.Cancelled;
        _removeOpen(id);
        _release(collection, pet, id);
        openStakes -= uint128(stake);
        emit ChallengeCancelled(id, msg.sender, reason);

        _pay(challenger, stake, id);
    }

    /// @notice Accept a challenge with your pet. The value is the stake plus the Entropy fee (`quote()`); anything over
    ///         is refunded. Reverts `ChallengerPetGone` if the challenger no longer owns their pet, `ChallengerPetDead` if
    ///         it has died since (anyone may then cancel it), `PetDead` for a dead pet of yours, and `Expired` once
    ///         CHALLENGE_TTL has passed. Dead pets do not fight (operator, 2026-09-29).
    function accept(uint256 id, address collection, uint256 tokenId)
        external
        payable
        nonReentrant
        returns (uint64 sequence)
    {
        Fight storage f = _fights[id];
        if (f.status != Status.Open) revert NotOpen(id);
        if (block.timestamp >= uint256(f.createdAt) + CHALLENGE_TTL) revert Expired(id);
        address challenger = f.challenger;
        if (msg.sender == challenger) revert OwnChallenge();
        address opponent = f.opponent;
        if (opponent != address(0) && opponent != msg.sender) revert NotOpponent(opponent);
        uint8 col = _col(collection);
        if (_ownerOf(collection, tokenId) != msg.sender) revert NotOwner();
        if (!_alive(collection, tokenId, msg.sender)) revert PetDead(collection, tokenId);
        uint256 busy = activeFightOf[collection][tokenId];
        if (busy != 0) revert PetBusy(busy);
        if (_ownerOf(_colAddr(f.colA), f.petA) != challenger) revert ChallengerPetGone(id);
        if (!_alive(_colAddr(f.colA), f.petA, challenger)) revert ChallengerPetDead(id);

        uint256 stake = f.stake;
        address provider = ENTROPY.getDefaultProvider();
        uint256 fee = ENTROPY.getFeeV2(provider, CALLBACK_GAS);
        uint256 due = stake + fee;
        if (msg.value < due) revert WrongValue(due, msg.value);

        f.status = Status.Pending;
        f.acceptor = msg.sender;
        f.colB = col;
        f.petB = tokenId;
        f.provider = provider;
        f.acceptedAt = uint40(block.timestamp);
        _removeOpen(id);
        activeFightOf[collection][tokenId] = id;
        _fightsOf[msg.sender].push(id);
        openStakes -= uint128(stake);
        pendingStakes += uint128(2 * stake);

        // Pyth: fixed address, and it never calls back inside a request. The provider is named explicitly (it is the
        // default one) so a request is keyed by (provider, sequence): sequence numbers are per provider.
        sequence = ENTROPY.requestV2{value: fee}(provider, CALLBACK_GAS);
        bytes32 key = _requestKey(provider, sequence);
        if (_byRequest[key] != 0) revert SequenceReused(sequence);
        _byRequest[key] = id;
        f.sequence = sequence;
        emit ChallengeAccepted(id, msg.sender, collection, tokenId, provider, sequence, fee);

        uint256 excess = msg.value - due;
        if (excess != 0) _pay(msg.sender, excess, id);
    }

    /// @notice Pyth has not answered ENTROPY_TIMEOUT (a day) after the accept: anyone may call the fight off, and both
    ///         stakes go back to the two fighters (anyone, so a pet sold mid-fight, or fighters gone quiet, cannot leave the
    ///         fight and its pets locked). The Entropy fee is not refunded (Pyth has it). A callback that arrives afterwards
    ///         is refused.
    function abort(uint256 id) external nonReentrant {
        Fight storage f = _fights[id];
        if (f.status != Status.Pending) revert NotPending(id);
        address a = f.challenger;
        address b = f.acceptor;
        uint256 at = uint256(f.acceptedAt) + ENTROPY_TIMEOUT;
        if (block.timestamp < at) revert TooEarly(at);
        uint256 stake = f.stake;

        f.status = Status.Aborted;
        _release(_colAddr(f.colA), f.petA, id);
        _release(_colAddr(f.colB), f.petB, id);
        pendingStakes -= uint128(2 * stake);
        emit Aborted(id, msg.sender);

        _pay(a, stake, id);
        _pay(b, stake, id);
    }

    // ---------------------------------------------------------------- the fight
    function getEntropy() internal view override returns (address) {
        return address(ENTROPY);
    }

    /// @dev Pyth's answer (the base contract has already checked msg.sender is ENTROPY). Refuses a request that is not
    ///      a pending fight's; for a pending one it cannot revert (see the contract's notes).
    function entropyCallback(uint64 sequence, address provider, bytes32 randomNumber) internal override {
        uint256 id = _byRequest[_requestKey(provider, sequence)];
        if (id == 0) revert UnknownRequest(provider, sequence);
        Fight storage f = _fights[id];
        if (f.status != Status.Pending) revert NotPending(id);

        // Take the lock if it is free, so the winner cannot re-enter from the payout; never revert on it.
        uint256 lockWas = _lock;
        _lock = 2;

        f.status = Status.Fought;
        f.random = randomNumber;
        f.foughtAt = uint40(block.timestamp);

        address colA = _colAddr(f.colA);
        address colB = _colAddr(f.colB);
        uint256 petA = f.petA;
        uint256 petB = f.petB;
        _release(colA, petA, id);
        _release(colB, petB, id);

        bool challengerWins = uint256(randomNumber) % 2 == 0;
        address winner;
        address loser;
        if (challengerWins) {
            winner = f.challenger;
            loser = f.acceptor;
            _score(colA, petA, true, id);
            _score(colB, petB, false, id);
        } else {
            winner = f.acceptor;
            loser = f.challenger;
            _score(colB, petB, true, id);
            _score(colA, petA, false, id);
        }

        uint256 stake = f.stake;
        uint256 pot = 2 * stake;
        uint256 cut = (pot * FEE_BPS) / BPS;
        uint256 payout = pot - cut;
        pendingStakes -= uint128(pot);
        teamOwed += uint128(cut);

        _emitFought(
            id, winner, loser, challengerWins, colA, petA, colB, petB, stake, payout, cut, sequence, randomNumber
        );

        _pay(winner, payout, id);
        _lock = lockWas;
    }

    function _emitFought(
        uint256 id,
        address winner,
        address loser,
        bool challengerWins,
        address colA,
        uint256 petA,
        address colB,
        uint256 petB,
        uint256 stake,
        uint256 payout,
        uint256 cut,
        uint64 sequence,
        bytes32 randomNumber
    ) private {
        if (challengerWins) {
            emit Fought(id, winner, loser, colA, petA, colB, petB, stake, payout, cut, sequence, randomNumber);
        } else {
            emit Fought(id, winner, loser, colB, petB, colA, petA, stake, payout, cut, sequence, randomNumber);
        }
    }

    // ---------------------------------------------------------------- money out
    /// @notice Take what this contract owes you (a payout or refund whose push failed).
    function withdraw() external nonReentrant {
        _withdraw(msg.sender);
    }

    /// @notice Take what this contract owes you, sent to another address (for a wallet that cannot receive MON).
    function withdrawTo(address to) external nonReentrant {
        if (to == address(0)) revert ZeroAddress();
        _withdraw(to);
    }

    /// @notice Push the team's accrued cut to TEAM. Anyone. If TEAM refuses it, it stays owed (the call reverts).
    function sweep() external nonReentrant {
        uint256 amount = teamOwed;
        if (amount == 0) revert NothingToDo();
        teamOwed = 0;
        if (!_send(TEAM, amount, gasleft())) revert TransferFailed();
        emit Swept(amount);
    }

    // ---------------------------------------------------------------- views
    /// @notice The Entropy fee an accept pays now, on top of the stake.
    function quote() external view returns (uint256) {
        return ENTROPY.getFeeV2(ENTROPY.getDefaultProvider(), CALLBACK_GAS);
    }

    /// @notice One challenge or fight (a challenge becomes a fight when accepted). An unknown id reads status None.
    function fight(uint256 id) public view returns (FightView memory v) {
        Fight storage f = _fights[id];
        if (f.status == Status.None) return v;
        v.id = id;
        v.status = f.status;
        v.challenger = f.challenger;
        v.challengerCollection = _colAddr(f.colA);
        v.challengerPet = f.petA;
        v.opponent = f.opponent;
        v.stake = f.stake;
        v.createdAt = f.createdAt;
        v.expiresAt = uint256(f.createdAt) + CHALLENGE_TTL;
        if (f.acceptor != address(0)) {
            v.acceptor = f.acceptor;
            v.acceptorCollection = _colAddr(f.colB);
            v.acceptorPet = f.petB;
            v.acceptedAt = f.acceptedAt;
            v.abortableAt = uint256(f.acceptedAt) + ENTROPY_TIMEOUT;
            v.provider = f.provider;
            v.sequence = f.sequence;
        }
        uint256 pot = 2 * uint256(f.stake);
        v.payout = pot - (pot * FEE_BPS) / BPS;
        if (f.status == Status.Fought) {
            v.random = f.random;
            v.foughtAt = f.foughtAt;
            v.winner = uint256(f.random) % 2 == 0 ? f.challenger : f.acceptor;
        }
    }

    /// @notice How many challenges are open (expired ones count until someone cancels them).
    function openCount() external view returns (uint256) {
        return _open.length;
    }

    /// @notice A page of the open challenges. The order changes as challenges leave the list (swap-remove).
    function openChallenges(uint256 from, uint256 count) external view returns (FightView[] memory out) {
        uint256 n = _open.length;
        if (from >= n) return out;
        if (count > n - from) count = n - from;
        out = new FightView[](count);
        for (uint256 i = 0; i < count; i++) {
            out[i] = fight(_open[from + i]);
        }
    }

    /// @notice How many fights `who` has made or accepted.
    function fightCountOf(address who) external view returns (uint256) {
        return _fightsOf[who].length;
    }

    /// @notice A page of the fights `who` has made or accepted, oldest first.
    function fightsOf(address who, uint256 from, uint256 count) external view returns (FightView[] memory out) {
        uint256[] storage list = _fightsOf[who];
        uint256 n = list.length;
        if (from >= n) return out;
        if (count > n - from) count = n - from;
        out = new FightView[](count);
        for (uint256 i = 0; i < count; i++) {
            out[i] = fight(list[from + i]);
        }
    }

    /// @notice A pet's fight record.
    function recordOf(address collection, uint256 tokenId) external view returns (Record memory) {
        return _records[collection][tokenId];
    }

    /// @notice What each pet wears now because of its last fight: a belt if it won it, a black eye if it lost it, for
    ///         LOOK_FOR after it. Unknown collections and pets that never fought read nothing.
    function looksOf(address[] calldata collections, uint256[] calldata tokenIds)
        external
        view
        returns (Look[] memory out)
    {
        if (collections.length != tokenIds.length) revert LengthMismatch();
        out = new Look[](tokenIds.length);
        for (uint256 i = 0; i < tokenIds.length; i++) {
            Record storage r = _records[collections[i]][tokenIds[i]];
            if (r.lastAt == 0) continue;
            uint256 until = uint256(r.lastAt) + LOOK_FOR;
            if (block.timestamp >= until) continue;
            if (r.lastWon) out[i].beltUntil = until;
            else out[i].blackEyeUntil = until;
        }
    }

    /// @notice The fight a Pyth request belongs to, 0 if none.
    function fightOfRequest(address provider, uint64 sequence) external view returns (uint256) {
        return _byRequest[_requestKey(provider, sequence)];
    }

    /// @notice What the balance must at least hold: open and pending stakes, what is owed, the team's cut.
    function accounted() external view returns (uint256) {
        return uint256(openStakes) + pendingStakes + totalOwed + teamOwed;
    }

    // ---------------------------------------------------------------- internals
    function _col(address collection) private view returns (uint8) {
        if (collection == CAT) return 1;
        if (collection == FROK) return 2;
        if (collection == SAHUR) return 3;
        revert CollectionNotAllowed(collection);
    }

    function _colAddr(uint8 col) private view returns (address) {
        if (col == 1) return CAT;
        if (col == 2) return FROK;
        if (col == 3) return SAHUR;
        return address(0);
    }

    function _requestKey(address provider, uint64 sequence) private pure returns (bytes32) {
        return keccak256(abi.encode(provider, sequence));
    }

    /// @dev ownerOf(id), or 0 for a revert, a short answer or a word that is not an address.
    function _ownerOf(address collection, uint256 tokenId) private view returns (address) {
        (bool ok, bytes memory ret) = collection.staticcall(abi.encodeWithSignature("ownerOf(uint256)", tokenId));
        if (!ok || ret.length < 32) return address(0);
        uint256 w = abi.decode(ret, (uint256));
        if (w >> 160 != 0) return address(0);
        return address(uint160(w));
    }

    /// @dev state(id).alive, read by hand from the returned struct (NamedPetGate's reader): word 0 is the struct's
    ///      offset, then its head is id, owner, the name's offset, started, alive. The id and owner must match and alive
    ///      must be exactly 1; any other answer (a revert, a short one, a mismatch) counts as not alive. All three games
    ///      compute `alive` live from the feed clock, so a pet that has starved is dead here before anyone touches it.
    function _alive(address collection, uint256 tokenId, address owner) private view returns (bool) {
        (bool ok, bytes memory ret) = collection.staticcall(abi.encodeWithSignature("state(uint256)", tokenId));
        if (!ok || ret.length < 192) return false;
        uint256 head = _word(ret, 0);
        if (head > ret.length - 160) return false;
        if (_word(ret, head) != tokenId || _word(ret, head + 32) != uint256(uint160(owner))) return false;
        return _word(ret, head + 128) == 1;
    }

    /// @dev The 32-byte word at `at` in `b` (the caller has checked it is in range).
    function _word(bytes memory b, uint256 at) private pure returns (uint256 w) {
        assembly {
            w := mload(add(add(b, 32), at))
        }
    }

    function _removeOpen(uint256 id) private {
        uint256 at = _openAt[id]; // index + 1, never 0 for an open challenge
        uint256 last = _open.length;
        if (at != last) {
            uint256 moved = _open[last - 1];
            _open[at - 1] = moved;
            _openAt[moved] = at;
        }
        _open.pop();
        delete _openAt[id];
    }

    function _release(address collection, uint256 tokenId, uint256 id) private {
        if (activeFightOf[collection][tokenId] == id) delete activeFightOf[collection][tokenId];
    }

    function _score(address collection, uint256 tokenId, bool won, uint256 id) private {
        Record storage r = _records[collection][tokenId];
        if (won) r.wins += 1;
        else r.losses += 1;
        r.lastAt = uint40(block.timestamp);
        r.lastWon = won;
        r.lastFight = uint64(id);
    }

    /// @dev Push `amount` to `to` with PUSH_GAS; if it fails, owe it instead. Never reverts on the recipient.
    function _pay(address to, uint256 amount, uint256 id) private {
        if (_send(to, amount, PUSH_GAS)) {
            emit Paid(id, to, amount);
        } else {
            owed[to] += amount;
            totalOwed += uint128(amount);
            emit Credited(id, to, amount);
        }
    }

    function _withdraw(address to) private {
        uint256 amount = owed[msg.sender];
        if (amount == 0) revert NothingOwed();
        owed[msg.sender] = 0;
        totalOwed -= uint128(amount);
        if (!_send(to, amount, gasleft())) revert TransferFailed();
        emit Withdrawn(msg.sender, to, amount);
    }

    /// @dev A value call that copies no return data (a recipient cannot make us pay to copy a huge answer).
    function _send(address to, uint256 amount, uint256 gasCap) private returns (bool ok) {
        assembly ("memory-safe") {
            ok := call(gasCap, to, amount, 0, 0, 0, 0)
        }
    }
}
