// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Test, console} from "forge-std/Test.sol";
import {FightClub} from "../src/fightclub/FightClub.sol";
import {IEntropyConsumer} from "../src/fightclub/IEntropyConsumer.sol";
import {MockEntropy} from "./mocks/MockEntropy.sol";
import {MockPets, Fighter, Sink, Forcer} from "./mocks/FightMocks.sol";

/// @dev A contract fighter for the money audit: on receiving MON it can run a hook with ALL its gas (a reveal), refuse
///      only when it is being paid while already inside its own receive (a nested push), and count how deep it got.
contract AuditFighter {
    FightClub public club;
    address public hookTarget;
    bytes public hookData;
    bool public hookOk;
    bool public hookArmed;
    bool public refuseNested; // refuse MON when a push lands while this contract is already in receive
    bool public refuseAll;
    uint256 public depth;
    uint256 public maxDepth;
    uint256 public received;

    constructor(FightClub c) {
        club = c;
    }

    function arm(address target, bytes calldata data) external {
        hookTarget = target;
        hookData = data;
        hookArmed = true;
    }

    function setRefuseNested(bool v) external {
        refuseNested = v;
    }

    function setRefuseAll(bool v) external {
        refuseAll = v;
    }

    function doChallenge(uint256 value, address col, uint256 id, address opponent) external returns (uint256) {
        return club.challenge{value: value}(col, id, opponent);
    }

    function doAccept(uint256 value, uint256 fid, address col, uint256 id) external returns (uint64) {
        return club.accept{value: value}(fid, col, id);
    }

    function doCancel(uint256 fid) external {
        club.cancel(fid);
    }

    function doWithdraw() external {
        club.withdraw();
    }

    function doWithdrawTo(address to) external {
        club.withdrawTo(to);
    }

    receive() external payable {
        if (refuseAll) revert("no");
        depth++;
        if (depth > maxDepth) maxDepth = depth;
        if (depth > 1 && refuseNested) {
            depth--;
            revert("not while busy");
        }
        if (hookArmed) {
            hookArmed = false;
            (hookOk,) = hookTarget.call(hookData);
        }
        received += msg.value;
        depth--;
    }
}

/// @dev An Entropy whose sequence numbers are PER PROVIDER (as Pyth's are), so two providers hand out the same number.
contract TwoProviderEntropy {
    address public defaultProvider;
    mapping(address => uint64) public seqOf;
    mapping(address => mapping(uint64 => address)) public requester;
    uint128 public fee = 1 ether;

    function setDefaultProvider(address p) external {
        defaultProvider = p;
    }

    function getDefaultProvider() external view returns (address) {
        return defaultProvider;
    }

    function getFeeV2(address, uint32) external view returns (uint128) {
        return fee;
    }

    function requestV2(address provider, uint32) external payable returns (uint64 seq) {
        require(msg.value >= fee, "fee");
        seq = ++seqOf[provider];
        requester[provider][seq] = msg.sender;
    }

    function reveal(address provider, uint64 seq, bytes32 random) external {
        IEntropyConsumer(requester[provider][seq])._entropyCallback(seq, provider, random);
    }
}

contract FightClubAuditTest is Test {
    MockEntropy entropy;
    MockPets cats;
    MockPets froks;
    MockPets sahurs;
    FightClub club;

    address team = makeAddr("team");
    address alice = makeAddr("alice"); // cat 1, frok 1
    address bob = makeAddr("bob"); // sahur 1, cat 2
    address carol = makeAddr("carol"); // frok 2, sahur 2
    address dave = makeAddr("dave");
    address provider = 0x52DeaA1c84233F7bb8C8A45baeDE41091c616506;

    uint256 constant T0 = 1_790_000_000;
    uint256 constant STAKE = 10 ether;
    uint256 constant FEE = 1.4 ether;
    bytes32 constant EVEN = bytes32(uint256(0x1234));
    bytes32 constant ODD = bytes32(uint256(0x1235));

    function setUp() public {
        vm.warp(T0);
        entropy = new MockEntropy();
        cats = new MockPets();
        froks = new MockPets();
        sahurs = new MockPets();
        club = new FightClub(address(entropy), team, address(cats), address(froks), address(sahurs));
        cats.mint(alice); // cat 1
        froks.mint(alice); // frok 1
        sahurs.mint(bob); // sahur 1
        cats.mint(bob); // cat 2
        froks.mint(carol); // frok 2
        sahurs.mint(carol); // sahur 2
        vm.deal(alice, 100_000 ether);
        vm.deal(bob, 100_000 ether);
        vm.deal(carol, 100_000 ether);
        vm.deal(dave, 100_000 ether);
    }

    function _challenge(address who, address col, uint256 pet, uint256 stake, address opponent)
        internal
        returns (uint256)
    {
        vm.prank(who);
        return club.challenge{value: stake}(col, pet, opponent);
    }

    function _accept(address who, uint256 id, address col, uint256 pet) internal returns (uint64) {
        uint256 stake = club.fight(id).stake;
        vm.prank(who);
        return club.accept{value: stake + FEE}(id, col, pet);
    }

    function _solvent(FightClub c) internal view {
        assertEq(address(c).balance, c.accounted(), "balance == accounted");
    }

    function _solvent() internal view {
        _solvent(club);
    }

    // ------------------------------------------------------------ 1. the callback nested inside sweep()
    /// TEAM is a contract; while sweep pays it (lock held, teamOwed already zeroed) it reveals a pending fight. The new
    /// cut must land in teamOwed and stay there; the old cut must have gone out exactly once.
    function test_audit_callbackInsideSweep() public {
        AuditFighter t = new AuditFighter(FightClub(address(0)));
        FightClub c2 = new FightClub(address(entropy), address(t), address(cats), address(froks), address(sahurs));
        // fight 1 settles: 1 MON owed to the team
        vm.prank(alice);
        uint256 f1 = c2.challenge{value: STAKE}(address(cats), 1, address(0));
        vm.prank(bob);
        uint64 s1 = c2.accept{value: STAKE + FEE}(f1, address(sahurs), 1);
        entropy.reveal(s1, EVEN);
        assertEq(c2.teamOwed(), 1 ether);
        // fight 2 pending, 100 MON a side
        vm.prank(carol);
        uint256 f2 = c2.challenge{value: 100 ether}(address(froks), 2, address(0));
        vm.prank(alice);
        uint64 s2 = c2.accept{value: 100 ether + FEE}(f2, address(cats), 1);
        assertEq(c2.pendingStakes(), 200 ether);

        t.arm(address(entropy), abi.encodeCall(MockEntropy.reveal, (s2, ODD)));
        uint256 aliceBefore = alice.balance;
        vm.prank(dave);
        c2.sweep();
        assertTrue(t.hookOk(), "the reveal inside sweep went through");
        assertEq(entropy.statusOf(s2), entropy.DONE(), "the callback did not revert inside sweep");
        assertEq(t.received(), 1 ether, "the team got the first cut exactly once");
        assertEq(c2.teamOwed(), 10 ether, "the second cut is owed, not lost and not double-paid");
        assertEq(alice.balance - aliceBefore, 190 ether, "the winner was paid inside");
        assertEq(c2.pendingStakes(), 0);
        _solvent(c2);
        // the lock was handed back
        c2.sweep();
        assertEq(t.received(), 11 ether);
        assertEq(c2.teamOwed(), 0);
        _solvent(c2);
    }

    // ------------------------------------------------------------ 2. withdraw, the callback re-credits the withdrawer
    /// C withdraws what it is owed; during the push it reveals a fight it wins; the nested payout push is refused, so
    /// it must be credited to C again AFTER owed[C] was zeroed, and C must be able to withdraw that too.
    function test_audit_callbackInsideWithdraw_recreditsTheWithdrawer() public {
        AuditFighter c = new AuditFighter(club);
        cats.mint(address(c)); // cat 3
        froks.mint(address(c)); // frok 3
        vm.deal(address(c), 1_000 ether);
        // owed STAKE from a refused refund
        uint256 id0 = c.doChallenge(STAKE, address(cats), 3, address(0));
        c.setRefuseAll(true);
        c.doCancel(id0);
        c.setRefuseAll(false);
        assertEq(club.owed(address(c)), STAKE);
        // a pending fight C is in with its frok
        uint256 id = c.doChallenge(50 ether, address(froks), 3, address(0));
        uint64 seq = _accept(bob, id, address(sahurs), 1);

        c.setRefuseNested(true);
        c.arm(address(entropy), abi.encodeCall(MockEntropy.reveal, (seq, EVEN))); // C wins 95
        uint256 before = address(c).balance;
        c.doWithdraw();
        assertTrue(c.hookOk());
        assertEq(entropy.statusOf(seq), entropy.DONE(), "the callback did not revert");
        // (the nested receive reverted, so its depth bookkeeping was rolled back with it: the proof it arrived nested
        // is that the payout is owed, not in C's balance)
        assertEq(address(c).balance - before, STAKE, "only the withdrawal landed");
        assertEq(club.owed(address(c)), 95 ether, "the refused payout is owed again");
        assertEq(club.totalOwed(), 95 ether);
        assertEq(club.teamOwed(), 5 ether);
        _solvent();
        c.setRefuseNested(false);
        c.doWithdraw();
        assertEq(address(c).balance - before, STAKE + 95 ether);
        assertEq(club.totalOwed(), 0);
        _solvent();
        // the lock came back
        _challenge(alice, address(cats), 1, STAKE, address(0));
    }

    // ------------------------------------------------------------ 3. a reveal attempted from inside a payout push
    /// Inside withdraw's push, C reveals fight X. X's winner D tries, from its own receive (50k gas), to reveal fight Y.
    /// That inner reveal must be starved and fail whole; Y stays pending, X settles, D is paid or credited, and the
    /// lock ends free.
    function test_audit_revealFromInsidePayoutPushIsStarved() public {
        AuditFighter c = new AuditFighter(club);
        AuditFighter d = new AuditFighter(club);
        cats.mint(address(c)); // cat 3
        froks.mint(address(d)); // frok 3
        vm.deal(address(c), 1_000 ether);
        vm.deal(address(d), 1_000 ether);
        uint256 id0 = c.doChallenge(STAKE, address(cats), 3, address(0));
        c.setRefuseAll(true);
        c.doCancel(id0);
        c.setRefuseAll(false);

        // X: D vs bob; Y: alice vs carol
        uint256 x = d.doChallenge(20 ether, address(froks), 3, address(0));
        uint64 sx = _accept(bob, x, address(sahurs), 1);
        uint256 y = _challenge(alice, address(cats), 1, 30 ether, address(0));
        uint64 sy = _accept(carol, y, address(froks), 2);

        d.arm(address(entropy), abi.encodeCall(MockEntropy.reveal, (sy, EVEN)));
        c.arm(address(entropy), abi.encodeCall(MockEntropy.reveal, (sx, EVEN))); // D wins X
        uint256 dBefore = address(d).balance;
        c.doWithdraw();
        assertTrue(c.hookOk(), "the outer reveal went through");
        assertEq(entropy.statusOf(sx), entropy.DONE(), "X settled");
        assertEq(uint8(club.fight(x).status), uint8(FightClub.Status.Fought));
        assertEq(entropy.statusOf(sy), entropy.PENDING(), "Y untouched: the inner reveal was starved");
        assertEq(uint8(club.fight(y).status), uint8(FightClub.Status.Pending));
        assertFalse(d.hookOk(), "the inner reveal failed");
        // D got its 38 one way or the other
        assertEq(address(d).balance - dBefore + club.owed(address(d)), 38 ether, "D's winnings, paid or owed");
        _solvent();
        // Y still settles normally afterwards, and the lock is free
        entropy.reveal(sy, ODD);
        assertEq(uint8(club.fight(y).status), uint8(FightClub.Status.Fought));
        _challenge(alice, address(cats), 1, STAKE, address(0));
        _solvent();
    }

    // ------------------------------------------------------------ 4. withdrawTo where `to` reveals; winner is the withdrawer
    function test_audit_callbackInsideWithdrawTo() public {
        AuditFighter hook = new AuditFighter(club);
        Fighter w = new Fighter(club);
        cats.mint(address(w)); // cat 3
        vm.deal(address(w), 1_000 ether);
        uint256 id0 = w.doChallenge(STAKE, address(cats), 3, address(0));
        w.setMode(1);
        w.doCancel(id0);
        w.setMode(0);
        assertEq(club.owed(address(w)), STAKE);
        uint256 id = w.doChallenge(40 ether, address(cats), 3, address(0));
        uint64 seq = _accept(bob, id, address(sahurs), 1);
        hook.arm(address(entropy), abi.encodeCall(MockEntropy.reveal, (seq, EVEN))); // w wins 76
        uint256 wBefore = address(w).balance;
        w.doWithdrawTo(address(hook));
        assertTrue(hook.hookOk());
        assertEq(hook.received(), STAKE, "`to` got exactly the withdrawal");
        assertEq(address(w).balance - wBefore, 76 ether, "the winner was pushed its payout inside");
        assertEq(club.owed(address(w)), 0);
        assertEq(club.totalOwed(), 0);
        _solvent();
    }

    // ------------------------------------------------------------ 5. the same wallet on both sides of two fights
    function test_audit_walletChallengerOfOneAcceptorOfAnother() public {
        uint256 a = _challenge(alice, address(cats), 1, STAKE, address(0)); // alice challenges
        uint256 b = _challenge(bob, address(cats), 2, 20 ether, address(0)); // bob challenges
        uint64 sa = _accept(bob, a, address(sahurs), 1); // bob accepts a
        uint64 sb = _accept(alice, b, address(froks), 1); // alice accepts b
        assertEq(club.pendingStakes(), 60 ether);
        assertEq(club.fightCountOf(alice), 2);
        assertEq(club.fightCountOf(bob), 2);
        uint256 a0 = alice.balance;
        uint256 b0 = bob.balance;
        entropy.reveal(sa, ODD); // bob wins a: 19
        entropy.reveal(sb, EVEN); // bob wins b: 38
        assertEq(bob.balance - b0, 57 ether);
        assertEq(alice.balance, a0);
        assertEq(club.teamOwed(), 3 ether);
        assertEq(club.pendingStakes(), 0);
        assertEq(club.activeFightOf(address(cats), 1), 0);
        assertEq(club.activeFightOf(address(cats), 2), 0);
        assertEq(club.activeFightOf(address(sahurs), 1), 0);
        assertEq(club.activeFightOf(address(froks), 1), 0);
        _solvent();
    }

    // ------------------------------------------------------------ 6. two providers, the same sequence number
    function test_audit_perProviderSequencesDoNotCollide() public {
        TwoProviderEntropy e2 = new TwoProviderEntropy();
        address pA = address(0xA11);
        address pB = address(0xB22);
        FightClub c2 = new FightClub(address(e2), team, address(cats), address(froks), address(sahurs));
        e2.setDefaultProvider(pA);
        vm.prank(alice);
        uint256 f1 = c2.challenge{value: STAKE}(address(cats), 1, address(0));
        vm.prank(bob);
        uint64 s1 = c2.accept{value: STAKE + 1 ether}(f1, address(sahurs), 1);
        e2.setDefaultProvider(pB);
        vm.prank(carol);
        uint256 f2 = c2.challenge{value: 20 ether}(address(froks), 2, address(0));
        vm.prank(alice);
        uint64 s2 = c2.accept{value: 20 ether + 1 ether}(f2, address(froks), 1);
        assertEq(s1, 1);
        assertEq(s2, 1, "both providers handed out sequence 1");
        assertEq(c2.fightOfRequest(pA, 1), f1);
        assertEq(c2.fightOfRequest(pB, 1), f2);
        uint256 a0 = alice.balance;
        uint256 b0 = bob.balance;
        e2.reveal(pB, 1, ODD); // f2: alice (acceptor) wins 38
        assertEq(uint8(c2.fight(f1).status), uint8(FightClub.Status.Pending), "f1 untouched by B's answer");
        assertEq(alice.balance - a0, 38 ether);
        e2.reveal(pA, 1, ODD); // f1: bob wins 19
        assertEq(bob.balance - b0, 19 ether);
        vm.expectRevert(abi.encodeWithSelector(FightClub.NotPending.selector, f1));
        e2.reveal(pA, 1, EVEN);
        vm.prank(address(e2));
        vm.expectRevert(abi.encodeWithSelector(FightClub.UnknownRequest.selector, pA, 2));
        c2._entropyCallback(2, pA, EVEN);
        _solvent(c2);
    }

    // ------------------------------------------------------------ 7. fee moves between quote and accept
    function test_audit_feeDropRefundsTheDifference_feeRiseReverts() public {
        uint256 id = _challenge(alice, address(cats), 1, STAKE, address(0));
        entropy.setFee(2 ether);
        uint256 quoted = club.quote();
        assertEq(quoted, 2 ether);
        // the fee drops after the quote: the difference comes back
        entropy.setFee(1 ether);
        uint256 b0 = bob.balance;
        vm.prank(bob);
        club.accept{value: STAKE + quoted}(id, address(sahurs), 1);
        assertEq(b0 - bob.balance, STAKE + 1 ether, "paid the live fee, the rest refunded");
        assertEq(address(entropy).balance, 1 ether);
        _solvent();
        // the fee rises after the quote: refused, nothing spent
        uint256 id2 = _challenge(carol, address(froks), 2, STAKE, address(0));
        quoted = club.quote();
        entropy.setFee(3 ether);
        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(FightClub.WrongValue.selector, STAKE + 3 ether, STAKE + quoted));
        club.accept{value: STAKE + quoted}(id2, address(cats), 2);
        assertEq(uint8(club.fight(id2).status), uint8(FightClub.Status.Open));
        _solvent();
    }

    // ------------------------------------------------------------ 8. odd-wei stakes at the ends of the range
    function test_audit_oddWeiStakesExact() public {
        uint256[2] memory stakes = [uint256(1 ether + 7), 1_000 ether - 3];
        for (uint256 i = 0; i < 2; i++) {
            uint256 stake = stakes[i];
            uint256 id = _challenge(alice, address(cats), 1, stake, address(0));
            vm.prank(bob);
            uint64 seq = club.accept{value: stake + FEE}(id, address(sahurs), 1);
            uint256 a0 = alice.balance;
            uint256 t0 = club.teamOwed();
            entropy.reveal(seq, EVEN);
            uint256 pot = 2 * stake;
            uint256 cut = pot / 20;
            assertEq(alice.balance - a0, pot - cut);
            assertEq(club.teamOwed() - t0, cut);
            assertEq((alice.balance - a0) + (club.teamOwed() - t0), pot, "every wei of the pot accounted");
            _solvent();
        }
        club.sweep();
        assertEq(address(club).balance, 0, "nothing stranded");
    }

    // ------------------------------------------------------------ 9. withdrawTo back into the contract, or to Entropy
    function test_audit_withdrawToSelfRefused() public {
        Fighter w = new Fighter(club);
        cats.mint(address(w)); // cat 3
        vm.deal(address(w), 100 ether);
        uint256 id0 = w.doChallenge(STAKE, address(cats), 3, address(0));
        w.setMode(1);
        w.doCancel(id0);
        assertEq(club.owed(address(w)), STAKE);
        vm.expectRevert(FightClub.TransferFailed.selector);
        w.doWithdrawTo(address(club));
        assertEq(club.owed(address(w)), STAKE, "still owed; the books cannot be rewritten by paying ourselves");
        _solvent();
    }

    // ------------------------------------------------------------ 10. a long mixed run: the books after every step
    function test_audit_manyFightsBooksHold() public {
        uint256 teamPaid;
        for (uint256 i = 0; i < 40; i++) {
            uint256 stake = 1 ether + (i * 37 ether) % 999 ether;
            uint256 id = _challenge(alice, address(cats), 1, stake, address(0));
            _solvent();
            if (i % 7 == 3) {
                vm.prank(alice);
                club.cancel(id);
                _solvent();
                continue;
            }
            uint64 seq = _accept(bob, id, address(sahurs), 1);
            _solvent();
            if (i % 5 == 4) {
                vm.warp(block.timestamp + 24 hours);
                vm.prank(dave);
                club.abort(id);
                _solvent();
                assertFalse(entropy.reveal(seq, EVEN), "late answer refused");
                _solvent();
                continue;
            }
            entropy.reveal(seq, i % 2 == 0 ? EVEN : ODD);
            _solvent();
            if (i % 3 == 0) {
                teamPaid += club.teamOwed();
                club.sweep();
                _solvent();
            }
        }
        teamPaid += club.teamOwed();
        if (club.teamOwed() != 0) club.sweep();
        assertEq(team.balance, teamPaid);
        assertEq(address(club).balance, 0, "every wei left the contract to a fighter or the team");
        assertEq(club.openCount(), 0);
        assertEq(club.activeFightOf(address(cats), 1), 0);
        assertEq(club.activeFightOf(address(sahurs), 1), 0);
    }

    // ------------------------------------------------------------ 11. a payee who burns exactly the push gas but is an EOA-like
    /// A winner that spends *almost* all of PUSH_GAS and then succeeds must still be paid (the push is not "refused"
    /// just for being expensive), and the callback must still fit its budget.
    function test_audit_expensiveButHonestReceiverIsPaid() public {
        GasHungry g = new GasHungry();
        cats.mint(address(g)); // cat 3
        vm.deal(address(g), 100 ether);
        uint256 id = g.doChallenge(club, STAKE, address(cats), 3);
        uint64 seq = _accept(bob, id, address(sahurs), 1);
        uint256 before = address(g).balance;
        uint256 limit = club.CALLBACK_GAS();
        vm.prank(address(entropy));
        uint256 gas0 = gasleft();
        club._entropyCallback{gas: limit}(seq, provider, EVEN);
        uint256 used = gas0 - gasleft();
        console.log("callback gas with a receiver spending ~45k", used);
        assertEq(address(g).balance - before, 19 ether);
        assertEq(club.owed(address(g)), 0);
        _solvent();
    }

    // ------------------------------------------------------------ 12. accept excess refund cannot re-enter and steal
    function test_audit_acceptExcessRefundReentryLocked() public {
        Fighter f = new Fighter(club);
        sahurs.mint(address(f)); // sahur 3
        vm.deal(address(f), 100 ether);
        uint256 id = _challenge(alice, address(cats), 1, STAKE, address(0));
        f.setReentryId(id);
        f.setMode(3);
        f.doAccept(STAKE + FEE + 1 ether, id, address(sahurs), 3);
        assertFalse(f.reentered());
        assertEq(club.owed(address(f)), 1 ether);
        assertEq(uint8(club.fight(id).status), uint8(FightClub.Status.Pending));
        _solvent();
    }
}

/// @dev A receiver that burns most of PUSH_GAS in memory work and then takes the MON.
contract GasHungry {
    uint256 public sink;

    function doChallenge(FightClub c, uint256 value, address col, uint256 id) external returns (uint256) {
        return c.challenge{value: value}(col, id, address(0));
    }

    receive() external payable {
        // ~30k of gas in all: a loop of keccaks plus one cold SSTORE (22.1k); under PUSH_GAS but far from free
        bytes32 h;
        for (uint256 i = 0; i < 40; i++) {
            h = keccak256(abi.encode(h, i));
        }
        assembly {
            sstore(0, 1)
        } // one warm-ish write to make it real; a cold SSTORE to a fresh slot is 22.1k, keep below 50k in all
    }
}
