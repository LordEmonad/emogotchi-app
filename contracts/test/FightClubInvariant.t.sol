// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Test, console} from "forge-std/Test.sol";
import {CommonBase} from "forge-std/Base.sol";
import {StdCheats} from "forge-std/StdCheats.sol";
import {StdUtils} from "forge-std/StdUtils.sol";
import {FightClub} from "../src/fightclub/FightClub.sol";
import {MockEntropy} from "./mocks/MockEntropy.sol";
import {MockPets, Fighter} from "./mocks/FightMocks.sol";

/// @dev Stateful fuzz of Fight Club. The handler is a model: before every call it works out from the rules whether the
///      call must succeed (and only makes calls that must), then keeps each wallet's expected wealth (balance plus
///      what Fight Club owes it), the team's and Pyth's, so every wei can be checked after every call.
///      `fail_on_revert` is on: a revert the model did not predict fails the run.
///      Actors: three EOAs and two contract fighters that switch between taking MON, refusing it, re-entering, and
///      answering with 100 KB. Pets are moved between actors so challenges go void under their challengers.
contract FightHandler is CommonBase, StdCheats, StdUtils {
    FightClub public club;
    MockEntropy public entropy;
    MockPets[3] public cols;
    address public team;
    address[] public actors;
    mapping(address => bool) public isFighter;
    mapping(address => uint256) public fighterMode; // mirrors Fighter.mode for the model

    // every pet: collection index and id
    uint8[] public petCol;
    uint256[] public petId;

    // the model's money
    mapping(address => uint256) public expected; // balance + owed
    uint256 public expectedTeam; // TEAM's balance + teamOwed
    uint256 public expectedEntropy; // fees Pyth holds

    // ghosts
    uint256[] public pendingIds;
    uint256 public foughtCount;
    uint256 public callbackFailures; // a pending fight's callback that reverted: must stay 0
    uint256 public secondAnswers; // answers to a fight that is not pending, all refused
    bool public resolvedTwice;
    mapping(uint256 => uint256) public timesFought;
    mapping(uint8 => mapping(uint256 => uint256)) public foughtWith; // pet => fights it was in that were decided
    uint256 public calls;
    // how often each action really did something (not an early return), for the coverage test
    uint256 public nChallenge;
    uint256 public nDirect;
    uint256 public nAccept;
    uint256 public nExcess;
    uint256 public nCancelByChallenger;
    uint256 public nCancelExpired;
    uint256 public nCancelGone;
    uint256 public nCancelDead;
    uint256 public nDeaths;
    uint256 public nReveal;
    uint256 public nAbort;
    uint256 public nWithdraw;
    uint256 public nWithdrawTo;
    uint256 public nWithdrawReveal;
    uint256 public nSweep;

    address constant PROVIDER = 0x52DeaA1c84233F7bb8C8A45baeDE41091c616506;

    constructor(FightClub c, MockEntropy e, MockPets[3] memory p, address t, address[] memory a) {
        club = c;
        entropy = e;
        cols = p;
        team = t;
        actors = a;
        for (uint256 i = 0; i < a.length; i++) {
            expected[a[i]] = a[i].balance;
            if (a[i].code.length > 0) isFighter[a[i]] = true;
            for (uint8 k = 0; k < 3; k++) {
                for (uint256 j = 0; j < 2; j++) {
                    petCol.push(k);
                    petId.push(p[k].mint(a[i]));
                }
            }
        }
    }

    // ---------------------------------------------------------------- views for the invariants
    function actorCount() external view returns (uint256) {
        return actors.length;
    }

    function petCount() external view returns (uint256) {
        return petId.length;
    }

    function pendingCount() external view returns (uint256) {
        return pendingIds.length;
    }

    // ---------------------------------------------------------------- helpers
    function _col(uint8 k) internal view returns (address) {
        return address(cols[k]);
    }

    function _owner(uint256 p) internal view returns (address) {
        return cols[petCol[p]].ownerOf(petId[p]);
    }

    function _act(address who, uint256 value, bytes memory data) internal {
        // an EOA calls directly; a contract fighter calls through its own do* function, from its own balance
        calls++;
        if (isFighter[who]) {
            (bool ok, bytes memory ret) = who.call(data);
            if (!ok) assembly { revert(add(ret, 32), mload(ret)) }
        } else {
            vm.prank(who);
            (bool ok, bytes memory ret) = address(club).call{value: value}(data);
            if (!ok) assembly { revert(add(ret, 32), mload(ret)) }
        }
    }

    function _removePending(uint256 id) internal {
        for (uint256 i = 0; i < pendingIds.length; i++) {
            if (pendingIds[i] == id) {
                pendingIds[i] = pendingIds[pendingIds.length - 1];
                pendingIds.pop();
                return;
            }
        }
    }

    function _pickOpen(uint256 seed) internal view returns (uint256) {
        uint256 n = club.openCount();
        if (n == 0) return 0;
        return club.openChallenges(seed % n, 1)[0].id;
    }

    // ---------------------------------------------------------------- actions
    function challenge(uint256 petSeed, uint256 stakeSeed, uint256 oppSeed) external {
        uint256 p = petSeed % petId.length;
        address who = _owner(p);
        address col = _col(petCol[p]);
        if (club.activeFightOf(col, petId[p]) != 0) return; // busy: the model says it would revert
        if (cols[petCol[p]].dead(petId[p])) return; // dead pets do not fight
        uint256 stake = bound(stakeSeed, 1 ether, 1_000 ether);
        if (who.balance < stake) return;
        address opp = address(0);
        if (oppSeed % 3 == 0) {
            opp = actors[oppSeed % actors.length];
            if (opp == who) opp = address(0);
        }
        if (isFighter[who]) {
            _act(who, 0, abi.encodeCall(Fighter.doChallenge, (stake, col, petId[p], opp)));
        } else {
            _act(who, stake, abi.encodeCall(FightClub.challenge, (col, petId[p], opp)));
        }
        expected[who] -= stake;
        nChallenge++;
        if (opp != address(0)) nDirect++;
    }

    function accept(uint256 fightSeed, uint256 petSeed, uint256 excessSeed) external {
        uint256 id = _pickOpen(fightSeed);
        if (id == 0) return;
        FightClub.FightView memory v = club.fight(id);
        if (block.timestamp >= v.expiresAt) return;
        if (IOwner(v.challengerCollection).ownerOf(v.challengerPet) != v.challenger) return; // void
        if (MockPets(v.challengerCollection).dead(v.challengerPet)) return; // void: the challenger's pet died
        // find a pet whose owner may accept: not the challenger, the opponent if named, and not busy
        uint256 p = petSeed % petId.length;
        address who;
        bool found;
        for (uint256 i = 0; i < petId.length; i++) {
            uint256 q = (p + i) % petId.length;
            address o = _owner(q);
            if (o == v.challenger) continue;
            if (v.opponent != address(0) && o != v.opponent) continue;
            if (club.activeFightOf(_col(petCol[q]), petId[q]) != 0) continue;
            if (cols[petCol[q]].dead(petId[q])) continue;
            p = q;
            who = o;
            found = true;
            break;
        }
        if (!found) return;
        uint256 fee = club.quote();
        uint256 excess = excessSeed % 4 == 0 ? bound(excessSeed, 0, 5 ether) : 0;
        uint256 value = v.stake + fee + excess;
        if (who.balance < value) return;
        if (isFighter[who]) {
            _act(who, 0, abi.encodeCall(Fighter.doAccept, (value, id, _col(petCol[p]), petId[p])));
        } else {
            _act(who, value, abi.encodeCall(FightClub.accept, (id, _col(petCol[p]), petId[p])));
        }
        expected[who] -= v.stake + fee;
        expectedEntropy += fee;
        pendingIds.push(id);
        nAccept++;
        if (excess != 0) nExcess++;
    }

    function cancel(uint256 fightSeed, uint256 bySeed) external {
        uint256 id = _pickOpen(fightSeed);
        if (id == 0) return;
        FightClub.FightView memory v = club.fight(id);
        address by = actors[bySeed % actors.length];
        bool gone = IOwner(v.challengerCollection).ownerOf(v.challengerPet) != v.challenger;
        bool dead = MockPets(v.challengerCollection).dead(v.challengerPet);
        if (by != v.challenger && block.timestamp < v.expiresAt && !gone && !dead) by = v.challenger;
        // a void challenge (its pet sold or dead) is mostly cleared by someone else, as it would be in the wild
        if ((gone || dead) && by == v.challenger && bySeed % 4 != 0) by = actors[(bySeed / 4 + 1) % actors.length] == v.challenger ? actors[(bySeed / 4 + 2) % actors.length] : actors[(bySeed / 4 + 1) % actors.length];
        if (isFighter[by]) _act(by, 0, abi.encodeCall(Fighter.doCancel, (id)));
        else _act(by, 0, abi.encodeCall(FightClub.cancel, (id)));
        expected[v.challenger] += v.stake;
        if (by == v.challenger) nCancelByChallenger++;
        else if (gone && block.timestamp < v.expiresAt) nCancelGone++;
        else if (dead && block.timestamp < v.expiresAt) nCancelDead++;
        else nCancelExpired++;
    }

    function reveal(uint256 fightSeed, uint256 random) external {
        if (pendingIds.length == 0) return;
        uint256 id = pendingIds[fightSeed % pendingIds.length];
        FightClub.FightView memory v = club.fight(id);
        calls++;
        entropy.reveal(v.sequence, bytes32(random));
        if (entropy.statusOf(v.sequence) != entropy.DONE()) callbackFailures++;
        _settle(id, v, random);
        nReveal++;
    }

    function _settle(uint256 id, FightClub.FightView memory v, uint256 random) internal {
        uint256 pot = 2 * v.stake;
        uint256 cut = (pot * 500) / 10_000;
        bool challengerWins = random % 2 == 0;
        address winner = challengerWins ? v.challenger : v.acceptor;
        expected[winner] += pot - cut;
        expectedTeam += cut;
        timesFought[id]++;
        if (timesFought[id] > 1) resolvedTwice = true;
        foughtCount++;
        foughtWith[_colIndex(v.challengerCollection)][v.challengerPet]++;
        foughtWith[_colIndex(v.acceptorCollection)][v.acceptorPet]++;
        _removePending(id);
    }

    function _colIndex(address c) internal view returns (uint8) {
        if (c == address(cols[0])) return 0;
        if (c == address(cols[1])) return 1;
        return 2;
    }

    function abort(uint256 fightSeed, bool byChallenger) external {
        if (pendingIds.length == 0) return;
        uint256 id = pendingIds[fightSeed % pendingIds.length];
        FightClub.FightView memory v = club.fight(id);
        if (block.timestamp < v.abortableAt) vm.warp(v.abortableAt);
        // anyone may call a stalled fight off: now and then it is a bystander, not one of the fighters
        address by = fightSeed % 3 == 0 ? actors[(fightSeed / 3) % actors.length] : byChallenger ? v.challenger : v.acceptor;
        if (isFighter[by]) _act(by, 0, abi.encodeCall(Fighter.doAbort, (id)));
        else _act(by, 0, abi.encodeCall(FightClub.abort, (id)));
        expected[v.challenger] += v.stake;
        expected[v.acceptor] += v.stake;
        _removePending(id);
        nAbort++;
    }

    /// A second answer from Pyth, or an answer to a request that was never made: always refused.
    function secondAnswer(uint256 idSeed, uint256 random, bool unknown) external {
        uint256 n = club.fightCount();
        if (n == 0) return;
        uint256 id = idSeed % n + 1;
        FightClub.FightView memory v = club.fight(id);
        uint64 seq = v.sequence;
        if (unknown) seq = type(uint64).max - uint64(idSeed % 1000);
        else if (v.status == FightClub.Status.Pending || v.acceptor == address(0)) return;
        calls++;
        vm.prank(address(entropy));
        try club._entropyCallback(seq, PROVIDER, bytes32(random)) {
            resolvedTwice = true;
        } catch {
            secondAnswers++;
        }
    }

    function withdraw(uint256 actorSeed, uint256 toSeed) external {
        address who = actors[actorSeed % actors.length];
        uint256 owed = club.owed(who);
        if (owed == 0) return;
        uint256 mode = fighterMode[who];
        if (!isFighter[who]) {
            _act(who, 0, abi.encodeCall(FightClub.withdraw, ()));
        } else if (mode == 0 || mode == 4) {
            _act(who, 0, abi.encodeCall(Fighter.doWithdraw, ()));
            nWithdraw++;
        } else {
            nWithdrawTo++;
            // it refuses MON: send it to an EOA actor instead
            address to = actors[toSeed % 3];
            _act(who, 0, abi.encodeCall(Fighter.doWithdrawTo, (to)));
            expected[who] -= owed;
            expected[to] += owed;
        }
    }

    /// A fighter withdraws, and while Fight Club is paying it (its lock held), it reveals a pending fight.
    function withdrawWhileRevealing(uint256 actorSeed, uint256 fightSeed, uint256 random) external {
        if (pendingIds.length == 0) return;
        address who = actors[3 + actorSeed % 2];
        uint256 owed = club.owed(who);
        if (owed == 0) return;
        uint256 id = pendingIds[fightSeed % pendingIds.length];
        FightClub.FightView memory v = club.fight(id);
        Fighter(payable(who))
            .setHook(address(entropy), abi.encodeCall(MockEntropy.reveal, (v.sequence, bytes32(random))));
        Fighter(payable(who)).setMode(5);
        _act(who, 0, abi.encodeCall(Fighter.doWithdraw, ()));
        fighterMode[who] = 0; // the hook runs once and leaves it taking MON
        if (!Fighter(payable(who)).hookOk()) callbackFailures++;
        if (entropy.statusOf(v.sequence) != entropy.DONE()) callbackFailures++;
        _settle(id, v, random);
        nWithdrawReveal++;
    }

    function sweep() external {
        if (club.teamOwed() == 0) return;
        calls++;
        club.sweep();
        nSweep++;
    }

    function transferPet(uint256 petSeed, uint256 toSeed) external {
        uint256 p = petSeed % petId.length;
        address from = _owner(p);
        address to = actors[toSeed % actors.length];
        if (to == from) return;
        vm.prank(from);
        cols[petCol[p]].transferFrom(from, to, petId[p]);
    }

    /// A pet starves, or is revived: open challenges of a dead pet become void, and a dead pet cannot challenge or
    /// accept. A fight already accepted plays out whatever happens to its pets.
    function setAlive(uint256 petSeed, bool alive) external {
        uint256 p = petSeed % petId.length;
        if (alive) {
            cols[petCol[p]].revive(petId[p]);
            return;
        }
        nDeaths++;
        // half the time it is a pet with a challenge out, so void challenges happen often enough to be exercised
        uint256 id = petSeed % 2 == 0 ? _pickOpen(petSeed / 2) : 0;
        if (id != 0) {
            FightClub.FightView memory v = club.fight(id);
            MockPets(v.challengerCollection).kill(v.challengerPet);
        } else {
            cols[petCol[p]].kill(petId[p]);
        }
    }

    function setMode(uint256 fighterSeed, uint256 modeSeed) external {
        address who = actors[3 + fighterSeed % 2];
        uint256[4] memory modes = [uint256(0), 1, 3, 4];
        uint256 m = modes[modeSeed % 4];
        Fighter(payable(who)).setMode(m);
        fighterMode[who] = m;
    }

    function setFee(uint256 seed) external {
        entropy.setFee(uint128(bound(seed, 0.5 ether, 3 ether)));
    }

    function warp(uint256 secs) external {
        vm.warp(block.timestamp + bound(secs, 0, 30 hours));
    }
}

interface IOwner {
    function ownerOf(uint256 id) external view returns (address);
}

contract FightClubInvariantTest is Test {
    FightHandler handler;
    FightClub club;
    MockEntropy entropy;
    MockPets[3] cols;
    address team = makeAddr("team");

    function setUp() public {
        vm.warp(1_790_000_000);
        entropy = new MockEntropy();
        for (uint256 k = 0; k < 3; k++) {
            cols[k] = new MockPets();
        }
        club = new FightClub(address(entropy), team, address(cols[0]), address(cols[1]), address(cols[2]));
        address[] memory a = new address[](5);
        a[0] = makeAddr("ann");
        a[1] = makeAddr("ben");
        a[2] = makeAddr("cat");
        a[3] = address(new Fighter(club));
        a[4] = address(new Fighter(club));
        for (uint256 i = 0; i < a.length; i++) {
            vm.deal(a[i], 100_000 ether);
        }
        handler = new FightHandler(club, entropy, cols, team, a);
        targetContract(address(handler));
    }

    /// forge-config: default.invariant.runs = 256
    /// forge-config: default.invariant.depth = 500
    function invariant_money() public view {
        // the contract's own books against its balance
        assertEq(address(club).balance, club.accounted(), "balance == open + pending + owed + team");
        // and against the fights themselves
        uint256 open;
        uint256 pending;
        uint256 n = club.fightCount();
        for (uint256 id = 1; id <= n; id++) {
            FightClub.FightView memory v = club.fight(id);
            if (v.status == FightClub.Status.Open) open += v.stake;
            else if (v.status == FightClub.Status.Pending) pending += 2 * v.stake;
        }
        assertEq(club.openStakes(), open, "openStakes");
        assertEq(club.pendingStakes(), pending, "pendingStakes");
        uint256 owed;
        for (uint256 i = 0; i < handler.actorCount(); i++) {
            owed += club.owed(handler.actors(i));
        }
        assertEq(club.totalOwed(), owed, "totalOwed");
    }

    /// forge-config: default.invariant.runs = 256
    /// forge-config: default.invariant.depth = 500
    function invariant_everyWeiWhereTheModelSaysItIs() public view {
        for (uint256 i = 0; i < handler.actorCount(); i++) {
            address a = handler.actors(i);
            assertEq(a.balance + club.owed(a), handler.expected(a), "a wallet's wealth");
        }
        assertEq(team.balance + club.teamOwed(), handler.expectedTeam(), "the team's");
        assertEq(address(entropy).balance, handler.expectedEntropy(), "Pyth's fees");
    }

    /// forge-config: default.invariant.runs = 256
    /// forge-config: default.invariant.depth = 500
    function invariant_noFightDecidedTwice() public view {
        assertFalse(handler.resolvedTwice(), "a fight was decided twice");
        assertEq(handler.callbackFailures(), 0, "a pending fight's callback reverted");
        uint256 fought;
        uint256 n = club.fightCount();
        for (uint256 id = 1; id <= n; id++) {
            if (club.fight(id).status == FightClub.Status.Fought) fought++;
        }
        assertEq(fought, handler.foughtCount(), "fought fights");
        assertEq(handler.pendingCount(), _count(FightClub.Status.Pending), "pending fights");
    }

    /// forge-config: default.invariant.runs = 256
    /// forge-config: default.invariant.depth = 500
    function invariant_openListAndPetLocks() public view {
        uint256 n = club.openCount();
        assertEq(n, _count(FightClub.Status.Open), "openCount == open fights");
        FightClub.FightView[] memory list = club.openChallenges(0, n);
        for (uint256 i = 0; i < n; i++) {
            assertEq(uint8(list[i].status), uint8(FightClub.Status.Open), "only open ones listed");
            for (uint256 j = 0; j < i; j++) {
                assertTrue(list[j].id != list[i].id, "no duplicates");
            }
        }
        // every pet's lock is exactly the open or pending fight it is in (ids are 1..10 in each collection)
        uint256[11][3] memory want;
        uint256 fights = club.fightCount();
        for (uint256 id = 1; id <= fights; id++) {
            FightClub.FightView memory v = club.fight(id);
            if (v.status != FightClub.Status.Open && v.status != FightClub.Status.Pending) continue;
            uint256 a = _k(v.challengerCollection);
            assertEq(want[a][v.challengerPet], 0, "a pet in two live fights");
            want[a][v.challengerPet] = id;
            if (v.status == FightClub.Status.Pending) {
                uint256 b = _k(v.acceptorCollection);
                assertEq(want[b][v.acceptorPet], 0, "a pet in two live fights");
                want[b][v.acceptorPet] = id;
            }
        }
        for (uint256 p = 0; p < handler.petCount(); p++) {
            uint8 k = handler.petCol(p);
            uint256 pet = handler.petId(p);
            address col = address(cols[k]);
            assertEq(club.activeFightOf(col, pet), want[k][pet], "activeFightOf");
            FightClub.Record memory r = club.recordOf(col, pet);
            assertEq(uint256(r.wins) + r.losses, handler.foughtWith(k, pet), "wins + losses");
        }
    }

    function _k(address c) internal view returns (uint256) {
        if (c == address(cols[0])) return 0;
        if (c == address(cols[1])) return 1;
        return 2;
    }

    function _count(FightClub.Status s) internal view returns (uint256 c) {
        uint256 n = club.fightCount();
        for (uint256 id = 1; id <= n; id++) {
            if (club.fight(id).status == s) c++;
        }
    }

    /// The same handler driven through 4,000 pseudo-random steps, to show every path the campaign relies on is
    /// actually reached (an action that always returned early would make the invariants look better than they are).
    function test_handlerReachesEveryPath() public {
        bytes4[14] memory sel = [
            FightHandler.challenge.selector,
            FightHandler.accept.selector,
            FightHandler.cancel.selector,
            FightHandler.reveal.selector,
            FightHandler.abort.selector,
            FightHandler.secondAnswer.selector,
            FightHandler.withdraw.selector,
            FightHandler.withdrawWhileRevealing.selector,
            FightHandler.sweep.selector,
            FightHandler.transferPet.selector,
            FightHandler.setAlive.selector,
            FightHandler.setMode.selector,
            FightHandler.setFee.selector,
            FightHandler.warp.selector
        ];
        for (uint256 i = 0; i < 8000; i++) {
            uint256 r = uint256(keccak256(abi.encode(i)));
            uint256 a = uint256(keccak256(abi.encode(r, 1)));
            uint256 b = uint256(keccak256(abi.encode(r, 2)));
            uint256 c = uint256(keccak256(abi.encode(r, 3)));
            bytes4 s = sel[r % 14];
            bytes memory data;
            if (s == FightHandler.sweep.selector) {
                data = abi.encodeWithSelector(s);
            } else if (s == FightHandler.abort.selector) {
                data = abi.encodeWithSelector(s, a, b % 2 == 0);
            } else if (s == FightHandler.setAlive.selector) {
                data = abi.encodeWithSelector(s, a, b % 3 != 0); // mostly revivals, so most pets stay alive
            } else if (s == FightHandler.secondAnswer.selector) {
                data = abi.encodeWithSelector(s, a, b, c % 4 == 0);
            } else if (s == FightHandler.setFee.selector || s == FightHandler.warp.selector) {
                data = abi.encodeWithSelector(s, s == FightHandler.warp.selector ? a % 30 hours : a);
            } else if (
                s == FightHandler.withdraw.selector || s == FightHandler.transferPet.selector
                    || s == FightHandler.setMode.selector
            ) {
                data = abi.encodeWithSelector(s, a, b);
            } else {
                data = abi.encodeWithSelector(s, a, b, c);
            }
            (bool ok, bytes memory ret) = address(handler).call(data);
            if (!ok) assembly { revert(add(ret, 32), mload(ret)) }
        }
        invariant_money();
        invariant_everyWeiWhereTheModelSaysItIs();
        invariant_noFightDecidedTwice();
        invariant_openListAndPetLocks();
        console.log("challenges", handler.nChallenge(), "direct", handler.nDirect());
        console.log("accepts", handler.nAccept(), "with excess", handler.nExcess());
        console.log("cancels: challenger / expired / pet gone");
        console.log(handler.nCancelByChallenger(), handler.nCancelExpired(), handler.nCancelGone());
        console.log("deaths", handler.nDeaths(), "cancels of a dead pet's challenge", handler.nCancelDead());
        console.log("reveals", handler.nReveal(), "aborts", handler.nAbort());
        console.log("withdraw / withdrawTo / withdraw while revealing");
        console.log(handler.nWithdraw(), handler.nWithdrawTo(), handler.nWithdrawReveal());
        console.log("sweeps", handler.nSweep(), "refused second answers", handler.secondAnswers());
        console.log("owed now", club.totalOwed(), "team swept", team.balance);
        assertGt(handler.nChallenge(), 0);
        assertGt(handler.nDirect(), 0);
        assertGt(handler.nAccept(), 0);
        assertGt(handler.nExcess(), 0);
        assertGt(handler.nCancelByChallenger(), 0);
        assertGt(handler.nCancelExpired(), 0);
        assertGt(handler.nCancelGone(), 0);
        assertGt(handler.nDeaths(), 0);
        assertGt(handler.nCancelDead(), 0);
        assertGt(handler.nReveal(), 0);
        assertGt(handler.nAbort(), 0);
        assertGt(handler.nWithdraw(), 0);
        assertGt(handler.nWithdrawTo(), 0);
        assertGt(handler.nWithdrawReveal(), 0);
        assertGt(handler.nSweep(), 0);
        assertGt(handler.secondAnswers(), 0);
    }

    function afterInvariant() external view {
        // a coarse check the campaign did something
        assertGt(handler.calls(), 0);
    }
}
