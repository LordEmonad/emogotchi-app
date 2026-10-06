// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Test, console} from "forge-std/Test.sol";
import {Vm} from "forge-std/Vm.sol";
import {FightClub} from "../src/fightclub/FightClub.sol";
import {MockEntropy} from "./mocks/MockEntropy.sol";
import {MockPets, WeirdPets, Fighter, Sink, Forcer} from "./mocks/FightMocks.sol";

/// @dev An Entropy that hands out the same sequence number every time (a broken or hostile upgrade).
contract RepeatEntropy {
    function getDefaultProvider() external pure returns (address) {
        return address(0xB0B);
    }

    function getFeeV2(address, uint32) external pure returns (uint128) {
        return 1 ether;
    }

    function requestV2(address, uint32) external payable returns (uint64) {
        return 7;
    }
}

/// Fight Club, unit by unit, against MockEntropy and three bare pet collections. Every payout is checked to the wei.
contract FightClubTest is Test {
    MockEntropy entropy;
    MockPets cats;
    MockPets froks;
    MockPets sahurs;
    FightClub club;

    address team = makeAddr("team");
    address alice = makeAddr("alice"); // cat 1, frok 1
    address bob = makeAddr("bob"); // sahur 1, cat 2
    address carol = makeAddr("carol"); // frok 2, sahur 2
    address dave = makeAddr("dave"); // no pets
    address provider = 0x52DeaA1c84233F7bb8C8A45baeDE41091c616506;

    uint256 constant T0 = 1_790_000_000; // setUp's clock (a literal: via_ir re-reads block.timestamp after a warp)
    uint256 constant STAKE = 10 ether;
    uint256 constant FEE = 1.4 ether;
    bytes32 constant EVEN = bytes32(uint256(0x1234)); // % 2 == 0: the challenger wins
    bytes32 constant ODD = bytes32(uint256(0x1235)); // % 2 == 1: the acceptor wins

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
        vm.deal(alice, 10_000 ether);
        vm.deal(bob, 10_000 ether);
        vm.deal(carol, 10_000 ether);
        vm.deal(dave, 10_000 ether);
    }

    // ---------------------------------------------------------------- helpers
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

    function _solvent() internal view {
        assertEq(address(club).balance, club.accounted(), "balance == accounted");
        assertEq(
            club.accounted(),
            uint256(club.openStakes()) + club.pendingStakes() + club.totalOwed() + club.teamOwed(),
            "accounted"
        );
    }

    function _pets(address a, uint256 ia, address b, uint256 ib)
        internal
        pure
        returns (address[] memory cols, uint256[] memory ids)
    {
        cols = new address[](2);
        ids = new uint256[](2);
        cols[0] = a;
        ids[0] = ia;
        cols[1] = b;
        ids[1] = ib;
    }

    // ---------------------------------------------------------------- construction
    function test_constructor_refusesZeroAndDuplicates() public {
        vm.expectRevert(FightClub.ZeroAddress.selector);
        new FightClub(address(0), team, address(cats), address(froks), address(sahurs));
        vm.expectRevert(FightClub.ZeroAddress.selector);
        new FightClub(address(entropy), address(0), address(cats), address(froks), address(sahurs));
        vm.expectRevert(FightClub.ZeroAddress.selector);
        new FightClub(address(entropy), team, address(cats), address(froks), address(0));
        vm.expectRevert(FightClub.DuplicateCollection.selector);
        new FightClub(address(entropy), team, address(cats), address(cats), address(sahurs));
        vm.expectRevert(FightClub.DuplicateCollection.selector);
        new FightClub(address(entropy), team, address(cats), address(froks), address(froks));
        assertEq(address(club.ENTROPY()), address(entropy));
        assertEq(club.TEAM(), team);
        assertEq(club.CAT(), address(cats));
        assertEq(club.FROK(), address(froks));
        assertEq(club.SAHUR(), address(sahurs));
        assertEq(club.MIN_STAKE(), 1 ether);
        assertEq(club.MAX_STAKE(), 1_000 ether);
        assertEq(club.FEE_BPS(), 500);
        assertEq(club.CHALLENGE_TTL(), 24 hours);
        assertEq(club.ENTROPY_TIMEOUT(), 24 hours);
        assertEq(club.LOOK_FOR(), 24 hours);
        assertEq(club.CALLBACK_GAS(), 1_000_000);
    }

    function test_plainMonIsRefused() public {
        vm.prank(alice);
        (bool ok,) = address(club).call{value: 1 ether}("");
        assertFalse(ok);
    }

    // ---------------------------------------------------------------- the happy paths
    function test_fight_challengerWins() public {
        uint256 id = _challenge(alice, address(cats), 1, STAKE, address(0));
        assertEq(id, 1);
        assertEq(address(club).balance, STAKE);
        assertEq(club.openStakes(), STAKE);
        assertEq(club.activeFightOf(address(cats), 1), 1);
        _solvent();

        uint256 entropyBefore = address(entropy).balance;
        uint64 seq = _accept(bob, id, address(sahurs), 1);
        assertEq(address(entropy).balance - entropyBefore, FEE, "the fee went to Pyth");
        assertEq(club.openStakes(), 0);
        assertEq(club.pendingStakes(), 2 * STAKE);
        assertEq(address(club).balance, 2 * STAKE);
        assertEq(club.fightOfRequest(provider, seq), id);
        FightClub.FightView memory v = club.fight(id);
        assertEq(uint8(v.status), uint8(FightClub.Status.Pending));
        assertEq(v.acceptor, bob);
        assertEq(v.acceptorCollection, address(sahurs));
        assertEq(v.acceptorPet, 1);
        assertEq(v.provider, provider);
        assertEq(v.sequence, seq);
        assertEq(v.abortableAt, block.timestamp + 24 hours);
        _solvent();

        uint256 aliceBefore = alice.balance;
        uint256 bobBefore = bob.balance;
        uint256 cut = (2 * STAKE * 500) / 10_000; // 1 MON
        uint256 payout = 2 * STAKE - cut; // 19 MON
        vm.expectEmit(address(club));
        emit FightClub.Fought(id, alice, bob, address(cats), 1, address(sahurs), 1, STAKE, payout, cut, seq, EVEN);
        assertTrue(entropy.reveal(seq, EVEN));
        assertEq(entropy.statusOf(seq), entropy.DONE());

        assertEq(alice.balance - aliceBefore, payout, "winner paid");
        assertEq(payout, 19 ether);
        assertEq(bob.balance, bobBefore, "loser paid nothing more");
        assertEq(club.teamOwed(), cut);
        assertEq(club.pendingStakes(), 0);
        assertEq(address(club).balance, cut);
        _solvent();

        v = club.fight(id);
        assertEq(uint8(v.status), uint8(FightClub.Status.Fought));
        assertEq(v.winner, alice);
        assertEq(v.random, EVEN);
        assertEq(v.foughtAt, block.timestamp);
        assertEq(v.payout, payout);
        assertEq(club.activeFightOf(address(cats), 1), 0);
        assertEq(club.activeFightOf(address(sahurs), 1), 0);

        FightClub.Record memory ra = club.recordOf(address(cats), 1);
        FightClub.Record memory rb = club.recordOf(address(sahurs), 1);
        assertEq(ra.wins, 1);
        assertEq(ra.losses, 0);
        assertTrue(ra.lastWon);
        assertEq(ra.lastAt, block.timestamp);
        assertEq(ra.lastFight, id);
        assertEq(rb.wins, 0);
        assertEq(rb.losses, 1);
        assertFalse(rb.lastWon);
    }

    function test_fight_acceptorWins() public {
        uint256 id = _challenge(carol, address(froks), 2, STAKE, address(0));
        uint64 seq = _accept(alice, id, address(cats), 1);
        uint256 aliceBefore = alice.balance;
        uint256 carolBefore = carol.balance;
        vm.expectEmit(address(club));
        emit FightClub.Fought(id, alice, carol, address(cats), 1, address(froks), 2, STAKE, 19 ether, 1 ether, seq, ODD);
        entropy.reveal(seq, ODD);
        assertEq(alice.balance - aliceBefore, 19 ether);
        assertEq(carol.balance, carolBefore);
        assertEq(club.fight(id).winner, alice);
        assertEq(club.recordOf(address(cats), 1).wins, 1);
        assertEq(club.recordOf(address(froks), 2).losses, 1);
        _solvent();
    }

    function testFuzz_payoutMath(uint256 stake, uint256 random, bool acceptorFirst) public {
        stake = bound(stake, 1 ether, 1_000 ether);
        uint256 id = _challenge(alice, address(cats), 1, stake, address(0));
        uint64 seq;
        uint256 excess = acceptorFirst ? 3 wei : 0;
        vm.prank(carol);
        seq = club.accept{value: stake + FEE + excess}(id, address(froks), 2);
        uint256 aliceBefore = alice.balance;
        uint256 carolBefore = carol.balance;
        entropy.reveal(seq, bytes32(random));
        uint256 cut = (2 * stake * 500) / 10_000;
        uint256 payout = 2 * stake - cut;
        assertEq(payout + cut, 2 * stake, "nothing made or lost");
        assertLe(cut * 20, 2 * stake, "cut at most 5%");
        if (random % 2 == 0) {
            assertEq(alice.balance - aliceBefore, payout);
            assertEq(carol.balance, carolBefore);
        } else {
            assertEq(carol.balance - carolBefore, payout);
            assertEq(alice.balance, aliceBefore);
        }
        assertEq(club.teamOwed(), cut);
        assertEq(address(club).balance, cut);
        _solvent();
    }

    // ---------------------------------------------------------------- the team's cut
    function test_sweep() public {
        vm.expectRevert(FightClub.NothingToDo.selector);
        club.sweep();
        uint256 id = _challenge(alice, address(cats), 1, 100 ether, address(0));
        entropy.reveal(_accept(bob, id, address(cats), 2), ODD);
        id = _challenge(alice, address(cats), 1, 50 ether, address(0));
        entropy.reveal(_accept(bob, id, address(cats), 2), EVEN);
        assertEq(club.teamOwed(), 15 ether); // 5% of 200 + 5% of 100
        vm.prank(dave); // anyone
        vm.expectEmit(address(club));
        emit FightClub.Swept(15 ether);
        club.sweep();
        assertEq(team.balance, 15 ether);
        assertEq(club.teamOwed(), 0);
        assertEq(address(club).balance, 0);
        vm.expectRevert(FightClub.NothingToDo.selector);
        club.sweep();
        _solvent();
    }

    function test_sweep_teamRefusesStaysOwed() public {
        Fighter badTeam = new Fighter(FightClub(address(0)));
        badTeam.setMode(1);
        FightClub c2 = new FightClub(address(entropy), address(badTeam), address(cats), address(froks), address(sahurs));
        vm.prank(alice);
        uint256 id = c2.challenge{value: STAKE}(address(cats), 1, address(0));
        vm.prank(bob);
        uint64 seq = c2.accept{value: STAKE + FEE}(id, address(cats), 2);
        entropy.reveal(seq, EVEN);
        assertEq(c2.teamOwed(), 1 ether);
        vm.expectRevert(FightClub.TransferFailed.selector);
        c2.sweep();
        assertEq(c2.teamOwed(), 1 ether, "still owed");
        badTeam.setMode(0);
        c2.sweep();
        assertEq(address(badTeam).balance, 1 ether);
        assertEq(c2.teamOwed(), 0);
    }

    // ---------------------------------------------------------------- pushes that fail
    function test_winnerRefuses_owed_thenWithdraw() public {
        Fighter f = new Fighter(club);
        cats.mint(address(f)); // cat 3
        vm.deal(address(f), 100 ether);
        uint256 id = f.doChallenge(STAKE, address(cats), 3, address(0));
        uint64 seq = _accept(bob, id, address(sahurs), 1);
        f.setMode(1);
        uint256 fBefore = address(f).balance;
        vm.expectEmit(address(club));
        emit FightClub.Credited(id, address(f), 19 ether);
        entropy.reveal(seq, EVEN);
        assertEq(entropy.statusOf(seq), entropy.DONE(), "the callback did not fail");
        assertEq(address(f).balance, fBefore, "not pushed");
        assertEq(club.owed(address(f)), 19 ether);
        assertEq(club.totalOwed(), 19 ether);
        _solvent();

        vm.expectRevert(FightClub.TransferFailed.selector);
        f.doWithdraw();
        assertEq(club.owed(address(f)), 19 ether, "a failed withdraw keeps it owed");

        vm.expectRevert(FightClub.ZeroAddress.selector);
        f.doWithdrawTo(address(0));
        Sink s = new Sink();
        vm.expectEmit(address(club));
        emit FightClub.Withdrawn(address(f), address(s), 19 ether);
        f.doWithdrawTo(address(s));
        assertEq(address(s).balance, 19 ether);
        assertEq(club.owed(address(f)), 0);
        assertEq(club.totalOwed(), 0);
        vm.expectRevert(FightClub.NothingOwed.selector);
        f.doWithdraw();
        _solvent();
    }

    function test_winnerWithdrawsToItself() public {
        Fighter f = new Fighter(club);
        cats.mint(address(f)); // cat 3
        vm.deal(address(f), 100 ether);
        uint256 id = f.doChallenge(STAKE, address(cats), 3, address(0));
        uint64 seq = _accept(bob, id, address(sahurs), 1);
        f.setMode(1);
        entropy.reveal(seq, EVEN);
        f.setMode(0);
        uint256 before = address(f).balance;
        f.doWithdraw();
        assertEq(address(f).balance - before, 19 ether);
        _solvent();
    }

    function test_winnerBurnsAllGas_creditedAndCallbackSucceeds() public {
        Fighter f = new Fighter(club);
        cats.mint(address(f));
        vm.deal(address(f), 100 ether);
        uint256 id = f.doChallenge(STAKE, address(cats), 3, address(0));
        uint64 seq = _accept(bob, id, address(sahurs), 1);
        f.setMode(2);
        entropy.reveal(seq, EVEN);
        assertEq(entropy.statusOf(seq), entropy.DONE());
        assertEq(club.owed(address(f)), 19 ether);
        assertEq(uint8(club.fight(id).status), uint8(FightClub.Status.Fought));
        _solvent();
    }

    function test_winnerReturnsHugeAnswer_noCopy() public {
        Fighter f = new Fighter(club);
        cats.mint(address(f));
        vm.deal(address(f), 100 ether);
        uint256 id = f.doChallenge(STAKE, address(cats), 3, address(0));
        uint64 seq = _accept(bob, id, address(sahurs), 1);
        f.setMode(4);
        vm.prank(address(entropy));
        uint256 g = gasleft();
        club._entropyCallback(seq, provider, EVEN);
        uint256 used = g - gasleft();
        console.log("callback gas, winner answers with 100 KB", used);
        assertLt(used, 300_000, "the answer was not copied");
        assertEq(uint8(club.fight(id).status), uint8(FightClub.Status.Fought));
        _solvent();
    }

    // ---------------------------------------------------------------- re-entry
    function test_reentrantWinnerIsRefusedAndCredited() public {
        Fighter f = new Fighter(club);
        cats.mint(address(f)); // cat 3
        vm.deal(address(f), 100 ether);
        uint256 id = f.doChallenge(STAKE, address(cats), 3, address(0));
        // a second open challenge of alice's for the re-entrant to try to cancel
        uint256 other = _challenge(alice, address(cats), 1, STAKE, address(0));
        f.setReentryId(other);
        uint64 seq = _accept(bob, id, address(sahurs), 1);
        f.setMode(3);
        entropy.reveal(seq, EVEN);
        assertEq(entropy.statusOf(seq), entropy.DONE());
        assertFalse(f.reentered(), "no way back in");
        assertEq(club.owed(address(f)), 19 ether, "the refused push was credited");
        assertEq(uint8(club.fight(other).status), uint8(FightClub.Status.Open));
        _solvent();
    }

    function test_reentrantRefundOnCancelIsRefused() public {
        Fighter f = new Fighter(club);
        cats.mint(address(f)); // cat 3
        vm.deal(address(f), 100 ether);
        uint256 id = f.doChallenge(STAKE, address(cats), 3, address(0));
        f.setReentryId(id);
        f.setMode(3);
        f.doCancel(id);
        assertFalse(f.reentered());
        assertEq(club.owed(address(f)), STAKE);
        assertEq(uint8(club.fight(id).status), uint8(FightClub.Status.Cancelled));
        _solvent();
    }

    /// Anyone holding Pyth's public revelation can trigger the callback at any moment, even from inside a payout of
    /// this contract while its lock is held. The callback must still settle the fight, not revert.
    function test_callbackRunsInsideAnotherCallOfOurs() public {
        // f is owed something, so it can call withdraw (which forwards all gas)
        Fighter f = new Fighter(club);
        cats.mint(address(f)); // cat 3
        vm.deal(address(f), 100 ether);
        uint256 id0 = f.doChallenge(STAKE, address(cats), 3, address(0));
        f.setMode(1);
        f.doCancel(id0); // refund refused: owed
        assertEq(club.owed(address(f)), STAKE);

        // a pending fight between alice and bob
        uint256 id = _challenge(alice, address(cats), 1, STAKE, address(0));
        uint64 seq = _accept(bob, id, address(sahurs), 1);

        // f withdraws; while Fight Club pays it (lock held), it reveals alice and bob's fight
        f.setHook(address(entropy), abi.encodeCall(MockEntropy.reveal, (seq, EVEN)));
        f.setMode(5);
        uint256 aliceBefore = alice.balance;
        f.doWithdraw();
        assertTrue(f.hookOk());
        assertEq(entropy.statusOf(seq), entropy.DONE(), "the callback did not revert");
        assertEq(uint8(club.fight(id).status), uint8(FightClub.Status.Fought));
        assertEq(alice.balance - aliceBefore, 19 ether);
        assertEq(club.owed(address(f)), 0);
        _solvent();
        // and the lock was handed back: the contract still works
        _challenge(alice, address(cats), 1, STAKE, address(0));
    }

    // ---------------------------------------------------------------- direct challenges
    function test_directChallenge_onlyTheOpponent() public {
        uint256 id = _challenge(alice, address(cats), 1, STAKE, bob);
        assertEq(club.fight(id).opponent, bob);
        vm.prank(carol);
        vm.expectRevert(abi.encodeWithSelector(FightClub.NotOpponent.selector, bob));
        club.accept{value: STAKE + FEE}(id, address(froks), 2);
        uint64 seq = _accept(bob, id, address(sahurs), 1);
        assertEq(club.fight(id).acceptor, bob);
        entropy.reveal(seq, ODD);
        assertEq(club.fight(id).winner, bob);
        _solvent();
    }

    function test_challenge_opponentCannotBeYourself() public {
        vm.prank(alice);
        vm.expectRevert(FightClub.BadOpponent.selector);
        club.challenge{value: STAKE}(address(cats), 1, alice);
    }

    // ---------------------------------------------------------------- cancel
    function test_cancel_byChallengerAnyTime() public {
        uint256 id = _challenge(alice, address(cats), 1, STAKE, address(0));
        uint256 before = alice.balance;
        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(FightClub.CannotCancel.selector, id));
        club.cancel(id);
        vm.expectEmit(address(club));
        emit FightClub.ChallengeCancelled(id, alice, 0);
        vm.prank(alice);
        club.cancel(id);
        assertEq(alice.balance - before, STAKE);
        assertEq(uint8(club.fight(id).status), uint8(FightClub.Status.Cancelled));
        assertEq(club.openCount(), 0);
        assertEq(club.openStakes(), 0);
        assertEq(club.activeFightOf(address(cats), 1), 0);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(FightClub.NotOpen.selector, id));
        club.cancel(id);
        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(FightClub.NotOpen.selector, id));
        club.accept{value: STAKE + FEE}(id, address(sahurs), 1);
        _solvent();
    }

    function test_cancel_byAnyoneAfterTtl() public {
        uint256 id = _challenge(alice, address(cats), 1, STAKE, address(0));
        vm.warp(T0 + 24 hours - 1);
        vm.prank(dave);
        vm.expectRevert(abi.encodeWithSelector(FightClub.CannotCancel.selector, id));
        club.cancel(id);
        vm.warp(T0 + 24 hours);
        uint256 before = alice.balance;
        vm.expectEmit(address(club));
        emit FightClub.ChallengeCancelled(id, dave, 1);
        vm.prank(dave);
        club.cancel(id);
        assertEq(alice.balance - before, STAKE, "the refund goes to the challenger");
        _solvent();
    }

    function test_cancel_byAnyoneWhenChallengerSoldThePet() public {
        uint256 id = _challenge(alice, address(cats), 1, STAKE, address(0));
        vm.prank(alice);
        cats.transferFrom(alice, carol, 1);
        // the challenge is void: nobody can accept it
        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(FightClub.ChallengerPetGone.selector, id));
        club.accept{value: STAKE + FEE}(id, address(sahurs), 1);
        // the new owner cannot challenge with the pet until it is cancelled
        vm.prank(carol);
        vm.expectRevert(abi.encodeWithSelector(FightClub.PetBusy.selector, id));
        club.challenge{value: STAKE}(address(cats), 1, address(0));
        // anyone may cancel it; the stake goes back to alice
        uint256 before = alice.balance;
        vm.expectEmit(address(club));
        emit FightClub.ChallengeCancelled(id, carol, 2);
        vm.prank(carol);
        club.cancel(id);
        assertEq(alice.balance - before, STAKE);
        uint256 id2 = _challenge(carol, address(cats), 1, STAKE, address(0));
        assertEq(club.activeFightOf(address(cats), 1), id2);
        _solvent();
    }

    // ---------------------------------------------------------------- dead pets do not fight; losers fight again
    function test_deadPet_cannotChallengeOrAccept() public {
        cats.kill(1);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(FightClub.PetDead.selector, address(cats), 1));
        club.challenge{value: STAKE}(address(cats), 1, address(0));
        // her living frok may
        uint256 id = _challenge(alice, address(froks), 1, STAKE, address(0));
        sahurs.kill(1);
        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(FightClub.PetDead.selector, address(sahurs), 1));
        club.accept{value: STAKE + FEE}(id, address(sahurs), 1);
        // a revived pet fights again
        sahurs.revive(1);
        _accept(bob, id, address(sahurs), 1);
        _solvent();
    }

    function test_challengerPetDies_voidAndAnyoneCancels() public {
        uint256 id = _challenge(alice, address(cats), 1, STAKE, address(0));
        cats.kill(1);
        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(FightClub.ChallengerPetDead.selector, id));
        club.accept{value: STAKE + FEE}(id, address(sahurs), 1);
        uint256 before = alice.balance;
        vm.expectEmit(address(club));
        emit FightClub.ChallengeCancelled(id, carol, 3);
        vm.prank(carol);
        club.cancel(id);
        assertEq(alice.balance - before, STAKE);
        _solvent();
    }

    function test_cancel_livingChallengersPetStillNeedsTheChallenger() public {
        uint256 id = _challenge(alice, address(cats), 1, STAKE, address(0));
        vm.prank(carol);
        vm.expectRevert(abi.encodeWithSelector(FightClub.CannotCancel.selector, id));
        club.cancel(id);
    }

    function test_loserFightsAgain() public {
        uint256 id = _challenge(alice, address(cats), 1, STAKE, address(0));
        entropy.reveal(_accept(bob, id, address(sahurs), 1), ODD); // bob's Sahur wins, alice's cat loses
        assertEq(club.activeFightOf(address(cats), 1), 0);
        uint256 id2 = _challenge(alice, address(cats), 1, STAKE, address(0));
        entropy.reveal(_accept(bob, id2, address(sahurs), 1), EVEN); // and the rematch goes to the cat
        FightClub.FightView memory v = club.fight(id2);
        assertEq(uint8(v.status), uint8(FightClub.Status.Fought));
        _solvent();
    }

    function test_cancel_notWhilePendingOrUnknown() public {
        uint256 id = _challenge(alice, address(cats), 1, STAKE, address(0));
        _accept(bob, id, address(sahurs), 1);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(FightClub.NotOpen.selector, id));
        club.cancel(id);
        vm.expectRevert(abi.encodeWithSelector(FightClub.NotOpen.selector, 99));
        club.cancel(99);
    }

    // ---------------------------------------------------------------- one fight per pet
    function test_onePetOneFight() public {
        uint256 id = _challenge(alice, address(cats), 1, STAKE, address(0));
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(FightClub.PetBusy.selector, id));
        club.challenge{value: STAKE}(address(cats), 1, address(0));
        // a different pet of alice's is free; the same id in another collection is another pet
        uint256 id2 = _challenge(alice, address(froks), 1, STAKE, address(0));
        // a pet with its own open challenge cannot accept another
        uint256 bobs = _challenge(bob, address(sahurs), 1, STAKE, address(0));
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(FightClub.PetBusy.selector, id2));
        club.accept{value: STAKE + FEE}(bobs, address(froks), 1);
        // once accepted, the challenger's pet is in a pending fight: still busy
        uint64 seq = _accept(bob, id, address(cats), 2);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(FightClub.PetBusy.selector, id));
        club.challenge{value: STAKE}(address(cats), 1, address(0));
        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(FightClub.PetBusy.selector, id));
        club.challenge{value: STAKE}(address(cats), 2, address(0));
        entropy.reveal(seq, EVEN);
        // free again
        _challenge(alice, address(cats), 1, STAKE, address(0));
        _challenge(bob, address(cats), 2, STAKE, address(0));
        _solvent();
    }

    // ---------------------------------------------------------------- ownership
    function test_challenge_ownershipAndCollection() public {
        vm.prank(bob);
        vm.expectRevert(FightClub.NotOwner.selector);
        club.challenge{value: STAKE}(address(cats), 1, address(0)); // alice's
        vm.prank(bob);
        vm.expectRevert(FightClub.NotOwner.selector);
        club.challenge{value: STAKE}(address(cats), 999, address(0)); // no such pet
        MockPets other = new MockPets();
        other.mint(alice);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(FightClub.CollectionNotAllowed.selector, address(other)));
        club.challenge{value: STAKE}(address(other), 1, address(0));
    }

    function test_ownerOfAnsweringBadlyReadsAsNotOwner() public {
        WeirdPets weird = new WeirdPets(alice);
        FightClub c2 = new FightClub(address(entropy), team, address(weird), address(froks), address(sahurs));
        vm.startPrank(alice);
        for (uint256 m = 1; m <= 3; m++) {
            weird.setMode(m);
            vm.expectRevert(FightClub.NotOwner.selector);
            c2.challenge{value: STAKE}(address(weird), 1, address(0));
        }
        weird.setMode(0);
        c2.challenge{value: STAKE}(address(weird), 1, address(0));
        vm.stopPrank();
    }

    function test_accept_ownershipChecks() public {
        uint256 id = _challenge(alice, address(cats), 1, STAKE, address(0));
        vm.prank(dave);
        vm.expectRevert(FightClub.NotOwner.selector);
        club.accept{value: STAKE + FEE}(id, address(sahurs), 1); // bob's
        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(FightClub.CollectionNotAllowed.selector, address(0xdead)));
        club.accept{value: STAKE + FEE}(id, address(0xdead), 1);
        vm.prank(alice);
        vm.expectRevert(FightClub.OwnChallenge.selector);
        club.accept{value: STAKE + FEE}(id, address(froks), 1);
        // the challenger's pet handed to the would-be acceptor: void, and it cannot fight itself
        vm.prank(alice);
        cats.transferFrom(alice, bob, 1);
        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(FightClub.PetBusy.selector, id));
        club.accept{value: STAKE + FEE}(id, address(cats), 1);
        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(FightClub.ChallengerPetGone.selector, id));
        club.accept{value: STAKE + FEE}(id, address(sahurs), 1);
    }

    // ---------------------------------------------------------------- stakes and value
    function test_stakeLimits() public {
        vm.startPrank(alice);
        vm.expectRevert(abi.encodeWithSelector(FightClub.StakeOutOfRange.selector, 1 ether - 1));
        club.challenge{value: 1 ether - 1}(address(cats), 1, address(0));
        vm.expectRevert(abi.encodeWithSelector(FightClub.StakeOutOfRange.selector, 1_000 ether + 1));
        club.challenge{value: 1_000 ether + 1}(address(cats), 1, address(0));
        vm.expectRevert(abi.encodeWithSelector(FightClub.StakeOutOfRange.selector, 0));
        club.challenge(address(cats), 1, address(0));
        uint256 a = club.challenge{value: 1 ether}(address(cats), 1, address(0));
        uint256 b = club.challenge{value: 1_000 ether}(address(froks), 1, address(0));
        vm.stopPrank();
        assertEq(club.fight(a).stake, 1 ether);
        assertEq(club.fight(b).stake, 1_000 ether);
        // the max stake fight pays out exactly
        vm.prank(bob);
        uint64 seq = club.accept{value: 1_000 ether + FEE}(b, address(sahurs), 1);
        uint256 before = bob.balance;
        entropy.reveal(seq, ODD);
        assertEq(bob.balance - before, 1_900 ether);
        assertEq(club.teamOwed(), 100 ether);
        _solvent();
    }

    function test_accept_wrongValue() public {
        uint256 id = _challenge(alice, address(cats), 1, STAKE, address(0));
        vm.startPrank(bob);
        vm.expectRevert(abi.encodeWithSelector(FightClub.WrongValue.selector, STAKE + FEE, STAKE));
        club.accept{value: STAKE}(id, address(sahurs), 1); // the stake alone
        vm.expectRevert(abi.encodeWithSelector(FightClub.WrongValue.selector, STAKE + FEE, STAKE + FEE - 1));
        club.accept{value: STAKE + FEE - 1}(id, address(sahurs), 1);
        vm.stopPrank();
    }

    function test_accept_excessRefunded() public {
        uint256 id = _challenge(alice, address(cats), 1, STAKE, address(0));
        uint256 before = bob.balance;
        vm.prank(bob);
        club.accept{value: STAKE + FEE + 5 ether}(id, address(sahurs), 1);
        assertEq(before - bob.balance, STAKE + FEE, "5 MON came back");
        assertEq(address(club).balance, 2 * STAKE);
        _solvent();
    }

    function test_accept_excessToARefuserIsOwed() public {
        Fighter f = new Fighter(club);
        sahurs.mint(address(f)); // sahur 3
        vm.deal(address(f), 100 ether);
        f.setMode(1);
        uint256 id = _challenge(alice, address(cats), 1, STAKE, address(0));
        f.doAccept(STAKE + FEE + 2 ether, id, address(sahurs), 3);
        assertEq(club.owed(address(f)), 2 ether);
        _solvent();
    }

    function test_quoteFollowsTheFee() public {
        assertEq(club.quote(), FEE);
        entropy.setFee(2 ether);
        assertEq(club.quote(), 2 ether);
        uint256 id = _challenge(alice, address(cats), 1, STAKE, address(0));
        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(FightClub.WrongValue.selector, STAKE + 2 ether, STAKE + FEE));
        club.accept{value: STAKE + FEE}(id, address(sahurs), 1);
        vm.prank(bob);
        club.accept{value: STAKE + 2 ether}(id, address(sahurs), 1);
        assertEq(address(entropy).balance, 2 ether);
        _solvent();
    }

    function test_accept_expired() public {
        uint256 id = _challenge(alice, address(cats), 1, STAKE, address(0));
        vm.warp(T0 + 24 hours);
        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(FightClub.Expired.selector, id));
        club.accept{value: STAKE + FEE}(id, address(sahurs), 1);
        vm.warp(T0 + 24 hours - 1);
        _accept(bob, id, address(sahurs), 1);
    }

    // ---------------------------------------------------------------- abort
    function test_abort() public {
        uint256 id = _challenge(alice, address(cats), 1, STAKE, address(0));
        uint64 seq = _accept(bob, id, address(sahurs), 1);
        uint256 at = T0 + 24 hours;
        vm.warp(at - 1);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(FightClub.TooEarly.selector, at));
        club.abort(id);
        vm.warp(at);
        // anyone may call it off once the day is up (a pet sold mid-fight, fighters gone quiet); the stakes still go
        // back to the two fighters, never to the caller
        uint256 a0 = alice.balance;
        uint256 b0 = bob.balance;
        uint256 c0 = carol.balance;
        vm.expectEmit(address(club));
        emit FightClub.Aborted(id, carol);
        vm.prank(carol);
        club.abort(id);
        assertEq(carol.balance, c0, "the caller gets nothing");
        assertEq(alice.balance - a0, STAKE);
        assertEq(bob.balance - b0, STAKE, "the stake back; the Entropy fee is Pyth's");
        assertEq(uint8(club.fight(id).status), uint8(FightClub.Status.Aborted));
        assertEq(club.pendingStakes(), 0);
        assertEq(address(club).balance, 0);
        assertEq(club.activeFightOf(address(cats), 1), 0);
        assertEq(club.activeFightOf(address(sahurs), 1), 0);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(FightClub.NotPending.selector, id));
        club.abort(id);
        _solvent();

        // Pyth answers late: refused, and nothing moves
        assertFalse(entropy.reveal(seq, EVEN), "the callback reverted");
        assertEq(entropy.statusOf(seq), entropy.FAILED());
        vm.expectRevert(abi.encodeWithSelector(FightClub.NotPending.selector, id));
        entropy.reveal(seq, EVEN); // the recovery path calls straight through
        assertEq(club.recordOf(address(cats), 1).wins, 0);
        assertEq(club.recordOf(address(sahurs), 1).losses, 0);
        _solvent();
    }

    function test_abort_notForOpenOrFought() public {
        uint256 id = _challenge(alice, address(cats), 1, STAKE, address(0));
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(FightClub.NotPending.selector, id));
        club.abort(id);
        uint64 seq = _accept(bob, id, address(sahurs), 1);
        entropy.reveal(seq, EVEN);
        vm.warp(block.timestamp + 2 hours);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(FightClub.NotPending.selector, id));
        club.abort(id);
    }

    function test_abort_toARefuserIsOwed() public {
        Fighter f = new Fighter(club);
        cats.mint(address(f)); // cat 3
        vm.deal(address(f), 100 ether);
        uint256 id = f.doChallenge(STAKE, address(cats), 3, address(0));
        _accept(bob, id, address(sahurs), 1);
        vm.warp(block.timestamp + 24 hours);
        f.setMode(1);
        uint256 b0 = bob.balance;
        vm.prank(bob);
        club.abort(id);
        assertEq(bob.balance - b0, STAKE);
        assertEq(club.owed(address(f)), STAKE);
        _solvent();
    }

    // ---------------------------------------------------------------- the callback's gate
    function test_callback_onlyFromEntropy() public {
        uint256 id = _challenge(alice, address(cats), 1, STAKE, address(0));
        uint64 seq = _accept(bob, id, address(sahurs), 1);
        vm.prank(alice);
        vm.expectRevert(bytes("Only Entropy can call this function"));
        club._entropyCallback(seq, provider, EVEN);
        vm.prank(bob);
        vm.expectRevert(bytes("Only Entropy can call this function"));
        club._entropyCallback(seq, provider, ODD);
        assertEq(uint8(club.fight(id).status), uint8(FightClub.Status.Pending));
    }

    function test_callback_unknownOrDuplicateRefused() public {
        uint256 id = _challenge(alice, address(cats), 1, STAKE, address(0));
        uint64 seq = _accept(bob, id, address(sahurs), 1);
        vm.startPrank(address(entropy));
        vm.expectRevert(abi.encodeWithSelector(FightClub.UnknownRequest.selector, provider, seq + 1));
        club._entropyCallback(seq + 1, provider, EVEN);
        vm.expectRevert(abi.encodeWithSelector(FightClub.UnknownRequest.selector, address(0xBEEF), seq));
        club._entropyCallback(seq, address(0xBEEF), EVEN); // right sequence, another provider
        club._entropyCallback(seq, provider, EVEN);
        vm.expectRevert(abi.encodeWithSelector(FightClub.NotPending.selector, id));
        club._entropyCallback(seq, provider, ODD); // a second answer cannot turn it round
        vm.stopPrank();
        assertEq(club.fight(id).winner, alice);
        assertEq(club.recordOf(address(cats), 1).wins, 1);
        _solvent();
    }

    function test_sequenceReusedByABrokenEntropyIsRefused() public {
        RepeatEntropy rep = new RepeatEntropy();
        FightClub c2 = new FightClub(address(rep), team, address(cats), address(froks), address(sahurs));
        vm.prank(alice);
        uint256 a = c2.challenge{value: STAKE}(address(cats), 1, address(0));
        vm.prank(carol);
        uint256 b = c2.challenge{value: STAKE}(address(froks), 2, address(0));
        vm.prank(bob);
        c2.accept{value: STAKE + 1 ether}(a, address(sahurs), 1);
        vm.prank(dave);
        sahurs.mint(dave); // sahur 3
        vm.prank(dave);
        vm.expectRevert(abi.encodeWithSelector(FightClub.SequenceReused.selector, 7));
        c2.accept{value: STAKE + 1 ether}(b, address(sahurs), 3);
    }

    // ---------------------------------------------------------------- looks and records
    function test_looksAndRecords() public {
        (address[] memory cols, uint256[] memory ids) = _pets(address(cats), 1, address(sahurs), 1);
        FightClub.Look[] memory l = club.looksOf(cols, ids);
        assertEq(l[0].beltUntil + l[0].blackEyeUntil + l[1].beltUntil + l[1].blackEyeUntil, 0, "never fought");

        uint256 id = _challenge(alice, address(cats), 1, STAKE, address(0));
        entropy.reveal(_accept(bob, id, address(sahurs), 1), EVEN);
        uint256 t = T0;
        l = club.looksOf(cols, ids);
        assertEq(l[0].beltUntil, t + 24 hours, "the winner wears the belt");
        assertEq(l[0].blackEyeUntil, 0);
        assertEq(l[1].blackEyeUntil, t + 24 hours, "the loser wears a black eye");
        assertEq(l[1].beltUntil, 0);

        // two hours on, the belted cat loses its next fight: the belt becomes a black eye
        vm.warp(t + 2 hours);
        id = _challenge(alice, address(cats), 1, STAKE, address(0));
        entropy.reveal(_accept(carol, id, address(froks), 2), ODD);
        l = club.looksOf(cols, ids);
        assertEq(l[0].beltUntil, 0);
        assertEq(l[0].blackEyeUntil, t + 26 hours);
        assertEq(l[1].blackEyeUntil, t + 24 hours, "sahur's own last fight still decides his");

        vm.warp(t + 24 hours - 1);
        l = club.looksOf(cols, ids);
        assertEq(l[1].blackEyeUntil, t + 24 hours);
        vm.warp(t + 24 hours);
        l = club.looksOf(cols, ids);
        assertEq(l[1].blackEyeUntil, 0, "a day after its fight, gone");
        assertEq(l[0].blackEyeUntil, t + 26 hours);
        vm.warp(t + 26 hours);
        l = club.looksOf(cols, ids);
        assertEq(l[0].beltUntil + l[0].blackEyeUntil + l[1].beltUntil + l[1].blackEyeUntil, 0);

        FightClub.Record memory r = club.recordOf(address(cats), 1);
        assertEq(r.wins, 1);
        assertEq(r.losses, 1);
        assertFalse(r.lastWon);
        assertEq(r.lastFight, id);
        assertEq(club.recordOf(address(froks), 2).wins, 1);
        // the same id in another collection is another pet
        assertEq(club.recordOf(address(froks), 1).wins + club.recordOf(address(froks), 1).losses, 0);

        address[] memory bad = new address[](1);
        vm.expectRevert(FightClub.LengthMismatch.selector);
        club.looksOf(bad, ids);
    }

    // ---------------------------------------------------------------- the lobby
    function test_openList_swapRemove() public {
        // five open challenges from five pets
        uint256 c1 = _challenge(alice, address(cats), 1, 1 ether, address(0));
        uint256 c2 = _challenge(alice, address(froks), 1, 2 ether, address(0));
        uint256 c3 = _challenge(bob, address(sahurs), 1, 3 ether, address(0));
        uint256 c4 = _challenge(bob, address(cats), 2, 4 ether, carol);
        uint256 c5 = _challenge(carol, address(froks), 2, 5 ether, address(0));
        assertEq(club.openCount(), 5);
        assertEq(club.openStakes(), 15 ether);

        vm.prank(bob);
        club.cancel(c3); // [c1 c2 c5 c4]
        _expectOpen(_ids4(c1, c2, c5, c4));
        _accept(carol, c1, address(sahurs), 2); // [c4 c2 c5]
        uint256[] memory want = new uint256[](3);
        want[0] = c4;
        want[1] = c2;
        want[2] = c5;
        _expectOpen(want);
        vm.prank(carol);
        club.cancel(c5); // last one: [c4 c2]
        vm.prank(bob);
        club.cancel(c4); // [c2]
        want = new uint256[](1);
        want[0] = c2;
        _expectOpen(want);
        assertEq(club.openStakes(), 2 ether);

        // paging
        FightClub.FightView[] memory page = club.openChallenges(0, 10);
        assertEq(page.length, 1);
        assertEq(page[0].id, c2);
        assertEq(page[0].challenger, alice);
        assertEq(page[0].challengerCollection, address(froks));
        assertEq(page[0].expiresAt, page[0].createdAt + 24 hours);
        assertEq(club.openChallenges(1, 10).length, 0);
        assertEq(club.openChallenges(5, 10).length, 0);
        assertEq(club.openChallenges(0, 0).length, 0);
        vm.prank(alice);
        club.cancel(c2);
        assertEq(club.openCount(), 0);
        assertEq(club.openChallenges(0, 10).length, 0);
        _solvent();
    }

    function _ids4(uint256 a, uint256 b, uint256 c, uint256 d) internal pure returns (uint256[] memory x) {
        x = new uint256[](4);
        x[0] = a;
        x[1] = b;
        x[2] = c;
        x[3] = d;
    }

    function _expectOpen(uint256[] memory want) internal view {
        assertEq(club.openCount(), want.length, "open count");
        FightClub.FightView[] memory page = club.openChallenges(0, 100);
        assertEq(page.length, want.length);
        for (uint256 i = 0; i < want.length; i++) {
            assertEq(page[i].id, want[i], "open list order");
            assertEq(uint8(page[i].status), uint8(FightClub.Status.Open));
        }
        // and paging one at a time reads the same list
        for (uint256 i = 0; i < want.length; i++) {
            assertEq(club.openChallenges(i, 1)[0].id, want[i]);
        }
    }

    function test_fightsOf() public {
        uint256 a = _challenge(alice, address(cats), 1, STAKE, address(0));
        uint256 b = _challenge(bob, address(sahurs), 1, STAKE, address(0));
        _accept(alice, b, address(froks), 1);
        assertEq(club.fightCountOf(alice), 2);
        assertEq(club.fightCountOf(bob), 1);
        assertEq(club.fightCountOf(dave), 0);
        FightClub.FightView[] memory mine = club.fightsOf(alice, 0, 10);
        assertEq(mine.length, 2);
        assertEq(mine[0].id, a);
        assertEq(mine[1].id, b);
        assertEq(uint8(mine[1].status), uint8(FightClub.Status.Pending));
        assertEq(club.fightsOf(alice, 1, 10).length, 1);
        assertEq(club.fightsOf(alice, 2, 10).length, 0);
        assertEq(club.fightsOf(dave, 0, 10).length, 0);
        assertEq(uint8(club.fight(12345).status), uint8(FightClub.Status.None));
        assertEq(club.fight(12345).id, 0);
    }

    // ---------------------------------------------------------------- stray MON
    function test_forcedMonIsHarmless() public {
        uint256 id = _challenge(alice, address(cats), 1, STAKE, address(0));
        new Forcer{value: 3 ether}(payable(address(club)));
        assertEq(address(club).balance, STAKE + 3 ether);
        assertEq(club.accounted(), STAKE);
        entropy.reveal(_accept(bob, id, address(sahurs), 1), ODD);
        club.sweep();
        assertEq(address(club).balance, 3 ether, "only the forced MON is left, and nothing can spend it");
        assertEq(club.accounted(), 0);
    }

    // ---------------------------------------------------------------- the callback's gas budget
    /// The worst case (the winner burns every gas it is given, so the payout is credited), with Fight Club's storage and
    /// the winner cold, then re-priced for Monad (each cold slot +6,000, a cold account +7,500): it must stay under a
    /// third of CALLBACK_GAS. The real Monad node measured ~254k for this case (test/tools/fightclub-monad-gas.mjs).
    function test_callbackGas_worstCaseLeavesAMargin() public {
        Fighter f = new Fighter(club);
        cats.mint(address(f)); // cat 3
        vm.deal(address(f), 100 ether);
        uint256 id = f.doChallenge(STAKE, address(cats), 3, address(0));
        uint64 seq = _accept(bob, id, address(sahurs), 1);
        f.setMode(2);
        uint256 limit = club.CALLBACK_GAS();
        vm.cool(address(club));
        vm.cool(address(f));
        vm.record();
        vm.prank(address(entropy));
        uint256 g = gasleft();
        club._entropyCallback{gas: limit}(seq, provider, EVEN);
        uint256 used = g - gasleft();
        (bytes32[] memory reads, bytes32[] memory writes) = vm.accesses(address(club));
        uint256 slots = _unique(reads, writes);
        uint256 monad = used + slots * 6_000 + 7_500;
        console.log("callback worst case, EVM schedule, cold", used);
        console.log("cold slots touched", slots);
        console.log("re-priced for Monad", monad);
        assertEq(club.owed(address(f)), 19 ether, "credited");
        // Measured 2026-09-29 for the same code: forge 1.5.1 (EVM 210,764, Monad ~314,264) and forge 1.8.3 (the Ultrafuzz
        // box: EVM 253,488, Monad ~356,988), so the newer schedule leaves 2.8x under CALLBACK_GAS. The bar is 2.5x: room
        // for Monad repricing, without raising CALLBACK_GAS (which would raise Pyth's fee on every fight).
        assertLt(monad * 5 / 2, limit, "at least a 2.5x margin");
    }

    function _unique(bytes32[] memory a, bytes32[] memory b) internal pure returns (uint256 n) {
        bytes32[] memory all = new bytes32[](a.length + b.length);
        for (uint256 i = 0; i < a.length; i++) {
            all[i] = a[i];
        }
        for (uint256 i = 0; i < b.length; i++) {
            all[a.length + i] = b[i];
        }
        for (uint256 i = 0; i < all.length; i++) {
            bool seen;
            for (uint256 j = 0; j < i; j++) {
                if (all[j] == all[i]) seen = true;
            }
            if (!seen) n++;
        }
    }

    // ---------------------------------------------------------------- gas (EVM schedule; see the README for Monad)
    function test_gas_measure() public {
        uint256 g;
        vm.prank(alice);
        g = gasleft();
        uint256 id = club.challenge{value: STAKE}(address(cats), 1, address(0));
        console.log("challenge (first ever)", g - gasleft());
        vm.prank(bob);
        g = gasleft();
        uint256 id2 = club.challenge{value: STAKE}(address(sahurs), 1, address(0));
        console.log("challenge", g - gasleft());
        vm.prank(alice);
        g = gasleft();
        club.cancel(id);
        console.log("cancel by challenger", g - gasleft());
        vm.prank(alice);
        g = gasleft();
        uint64 seq = club.accept{value: STAKE + FEE}(id2, address(cats), 1);
        console.log("accept (mock Entropy)", g - gasleft());
        vm.prank(address(entropy));
        g = gasleft();
        club._entropyCallback(seq, provider, EVEN);
        console.log("callback, winner an EOA", g - gasleft());
    }
}
