// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Test, console} from "forge-std/Test.sol";
import {FightClub} from "../src/fightclub/FightClub.sol";
import {MockEntropy} from "./mocks/MockEntropy.sol";
import {MockPets, Fighter} from "./mocks/FightMocks.sol";

/// Audit lens C: the state machine, the pet locks, griefing / DoS, liveness. Every case is driven through the public
/// surface; the invariants asserted after each step are the ones the site relies on.
contract FightClubAuditCTest is Test {
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
    address alt = makeAddr("alt"); // alice's second wallet

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
        vm.deal(alt, 100_000 ether);
    }

    function _challenge(address who, address col, uint256 pet, uint256 stake, address opp) internal returns (uint256) {
        vm.prank(who);
        return club.challenge{value: stake}(col, pet, opp);
    }

    function _accept(address who, uint256 id, address col, uint256 pet) internal returns (uint64) {
        uint256 stake = club.fight(id).stake;
        vm.prank(who);
        return club.accept{value: stake + FEE}(id, col, pet);
    }

    function _solvent() internal view {
        assertEq(address(club).balance, club.accounted(), "balance == accounted");
    }

    function _status(uint256 id) internal view returns (FightClub.Status) {
        return club.fight(id).status;
    }

    // ================================================================ pets moving mid-flow

    /// Between accept and the callback: the fight settles for the WALLETS that staked; the record and the look belong
    /// to the PET, so the buyer's pet wears the belt; the buyer cannot use the pet until the callback.
    function test_petSoldBetweenAcceptAndCallback() public {
        uint256 id = _challenge(alice, address(cats), 1, STAKE, address(0));
        uint64 seq = _accept(bob, id, address(sahurs), 1);
        vm.prank(alice);
        cats.transferFrom(alice, carol, 1);
        // the buyer is locked out of the pet until Pyth answers
        vm.prank(carol);
        vm.expectRevert(abi.encodeWithSelector(FightClub.PetBusy.selector, id));
        club.challenge{value: STAKE}(address(cats), 1, address(0));
        // nobody can cancel a pending fight, nor abort before the timeout
        vm.prank(carol);
        vm.expectRevert(abi.encodeWithSelector(FightClub.NotOpen.selector, id));
        club.cancel(id);
        vm.prank(carol);
        vm.expectRevert(abi.encodeWithSelector(FightClub.TooEarly.selector, T0 + 24 hours));
        club.abort(id);

        uint256 a0 = alice.balance;
        uint256 c0 = carol.balance;
        entropy.reveal(seq, EVEN); // the challenger's side wins
        assertEq(uint8(_status(id)), uint8(FightClub.Status.Fought));
        assertEq(alice.balance - a0, 2 * STAKE - STAKE / 10, "the payout goes to the wallet that staked");
        assertEq(carol.balance, c0, "the buyer gets nothing");
        assertEq(club.recordOf(address(cats), 1).wins, 1, "the record is the pet's");
        (address[] memory cols, uint256[] memory ids) = _one(address(cats), 1);
        assertGt(club.looksOf(cols, ids)[0].beltUntil, 0, "the buyer's pet wears the belt");
        assertEq(club.activeFightOf(address(cats), 1), 0, "free again");
        _challenge(carol, address(cats), 1, STAKE, address(0));
        _solvent();
    }

    /// The challenger hands the pet to the acceptor mid-pending: one wallet owns both fighters; it still settles.
    function test_petHandedToTheAcceptorMidPending() public {
        uint256 id = _challenge(alice, address(cats), 1, STAKE, address(0));
        uint64 seq = _accept(bob, id, address(sahurs), 1);
        vm.prank(alice);
        cats.transferFrom(alice, bob, 1);
        uint256 b0 = bob.balance;
        entropy.reveal(seq, ODD); // the acceptor wins
        assertEq(bob.balance - b0, 2 * STAKE - STAKE / 10);
        assertEq(club.recordOf(address(cats), 1).losses, 1);
        assertEq(club.recordOf(address(sahurs), 1).wins, 1);
        assertEq(club.activeFightOf(address(cats), 1), 0);
        assertEq(club.activeFightOf(address(sahurs), 1), 0);
        _solvent();
    }

    /// Between the callback and the reads: the look follows the pet, whoever holds it.
    function test_petSoldAfterTheFight_lookFollowsThePet() public {
        uint256 id = _challenge(alice, address(cats), 1, STAKE, address(0));
        entropy.reveal(_accept(bob, id, address(sahurs), 1), ODD); // cat loses
        vm.prank(alice);
        cats.transferFrom(alice, dave, 1);
        (address[] memory cols, uint256[] memory ids) = _one(address(cats), 1);
        assertEq(club.looksOf(cols, ids)[0].blackEyeUntil, block.timestamp + 24 hours);
        vm.warp(block.timestamp + 24 hours);
        assertEq(club.looksOf(cols, ids)[0].blackEyeUntil, 0, "off after a day");
    }

    /// A pet sold mid-pending while Pyth is silent: the buyer's pet is locked for the whole ENTROPY_TIMEOUT and the
    /// buyer's only way out is `abort` after it (the refunds still go to the two stakers).
    function test_petSoldMidPending_buyerLockedUntilAbort() public {
        uint256 id = _challenge(alice, address(cats), 1, STAKE, address(0));
        _accept(bob, id, address(sahurs), 1);
        vm.prank(alice);
        cats.transferFrom(alice, carol, 1);
        vm.warp(T0 + 24 hours - 1);
        vm.prank(carol);
        vm.expectRevert(abi.encodeWithSelector(FightClub.TooEarly.selector, T0 + 24 hours));
        club.abort(id);
        vm.warp(T0 + 24 hours);
        uint256 a0 = alice.balance;
        uint256 b0 = bob.balance;
        vm.prank(carol);
        club.abort(id);
        assertEq(alice.balance - a0, STAKE);
        assertEq(bob.balance - b0, STAKE);
        assertEq(club.activeFightOf(address(cats), 1), 0);
        _challenge(carol, address(cats), 1, STAKE, address(0));
        _solvent();
    }

    /// Transfer between challenge and accept, then back: the challenge is void while gone and live again when back
    /// (nothing is stuck, nothing needs a cancel).
    function test_petGoneThenBackBeforeAccept() public {
        uint256 id = _challenge(alice, address(cats), 1, STAKE, address(0));
        vm.prank(alice);
        cats.transferFrom(alice, alt, 1);
        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(FightClub.ChallengerPetGone.selector, id));
        club.accept{value: STAKE + FEE}(id, address(sahurs), 1);
        vm.prank(alt);
        cats.transferFrom(alt, alice, 1);
        vm.prank(dave);
        vm.expectRevert(abi.encodeWithSelector(FightClub.CannotCancel.selector, id));
        club.cancel(id);
        uint64 seq = _accept(bob, id, address(sahurs), 1);
        entropy.reveal(seq, EVEN);
        assertEq(uint8(_status(id)), uint8(FightClub.Status.Fought));
        _solvent();
    }

    // ================================================================ dying mid-flow

    /// Both pets die after the accept: the fight still settles, the payout goes out, and the DEAD pet is recorded a win
    /// and wears a belt. "Dead pets do not fight" holds at challenge and accept only; the callback never reads the
    /// games (by design: it must do fixed work). Documented as Info in the report.
    function test_petsDieDuringPending_fightStillSettles_deadPetWinsABelt() public {
        uint256 id = _challenge(alice, address(cats), 1, STAKE, address(0));
        uint64 seq = _accept(bob, id, address(sahurs), 1);
        cats.kill(1);
        sahurs.kill(1);
        uint256 a0 = alice.balance;
        entropy.reveal(seq, EVEN);
        assertEq(uint8(_status(id)), uint8(FightClub.Status.Fought));
        assertEq(alice.balance - a0, 2 * STAKE - STAKE / 10);
        assertEq(club.recordOf(address(cats), 1).wins, 1, "a dead pet is scored a win");
        (address[] memory cols, uint256[] memory ids) = _one(address(cats), 1);
        assertGt(club.looksOf(cols, ids)[0].beltUntil, 0, "and wears the belt");
        // and once dead it cannot fight again until revived
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(FightClub.PetDead.selector, address(cats), 1));
        club.challenge{value: STAKE}(address(cats), 1, address(0));
        _solvent();
    }

    /// Abort works whatever the pets' state (a dead pet mid-pending cannot lock a stake).
    function test_petsDieDuringPending_abortStillWorks() public {
        uint256 id = _challenge(alice, address(cats), 1, STAKE, address(0));
        _accept(bob, id, address(sahurs), 1);
        cats.kill(1);
        sahurs.kill(1);
        vm.warp(T0 + 24 hours);
        vm.prank(dave);
        club.abort(id);
        assertEq(uint8(_status(id)), uint8(FightClub.Status.Aborted));
        assertEq(club.activeFightOf(address(cats), 1), 0);
        _solvent();
    }

    /// The challenger's pet dies, then is revived before anyone cancels: the challenge is live again.
    function test_challengerPetDiesThenRevives_challengeLiveAgain() public {
        uint256 id = _challenge(alice, address(cats), 1, STAKE, address(0));
        cats.kill(1);
        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(FightClub.ChallengerPetDead.selector, id));
        club.accept{value: STAKE + FEE}(id, address(sahurs), 1);
        cats.revive(1);
        vm.prank(dave);
        vm.expectRevert(abi.encodeWithSelector(FightClub.CannotCancel.selector, id));
        club.cancel(id);
        _accept(bob, id, address(sahurs), 1);
        assertEq(uint8(_status(id)), uint8(FightClub.Status.Pending));
    }

    // ================================================================ time boundaries

    /// At exactly createdAt + TTL: no accept (Expired) and anyone may cancel (reason 1). One second before: the
    /// opposite. No second where neither is possible.
    function test_ttlBoundary_acceptAndCancelAreComplementary() public {
        uint256 id = _challenge(alice, address(cats), 1, STAKE, address(0));
        vm.warp(T0 + 24 hours - 1);
        vm.prank(dave);
        vm.expectRevert(abi.encodeWithSelector(FightClub.CannotCancel.selector, id));
        club.cancel(id);
        // (accept would work here: shown in test_accept_expired)
        vm.warp(T0 + 24 hours);
        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(FightClub.Expired.selector, id));
        club.accept{value: STAKE + FEE}(id, address(sahurs), 1);
        vm.expectEmit(address(club));
        emit FightClub.ChallengeCancelled(id, dave, 1);
        vm.prank(dave);
        club.cancel(id);
        _solvent();
    }

    /// Accept lands in the last second of the window: the fight is pending and its own clock starts from the accept.
    function test_acceptInTheLastSecond_pendingClockIsTheAccepts() public {
        uint256 id = _challenge(alice, address(cats), 1, STAKE, address(0));
        vm.warp(T0 + 24 hours - 1);
        _accept(bob, id, address(sahurs), 1);
        assertEq(club.fight(id).abortableAt, T0 + 24 hours - 1 + 24 hours);
        vm.warp(T0 + 24 hours - 1 + 24 hours - 1);
        vm.prank(dave);
        vm.expectRevert(abi.encodeWithSelector(FightClub.TooEarly.selector, T0 + 24 hours - 1 + 24 hours));
        club.abort(id);
        vm.warp(T0 + 24 hours - 1 + 24 hours);
        vm.prank(dave);
        club.abort(id);
        assertEq(uint8(_status(id)), uint8(FightClub.Status.Aborted));
    }

    /// The cancel reasons, in the order the code checks them.
    function test_cancelReasonOrder() public {
        // expired AND pet gone: expired wins (1)
        uint256 a = _challenge(alice, address(cats), 1, STAKE, address(0));
        vm.prank(alice);
        cats.transferFrom(alice, alt, 1);
        vm.warp(T0 + 24 hours);
        vm.expectEmit(address(club));
        emit FightClub.ChallengeCancelled(a, dave, 1);
        vm.prank(dave);
        club.cancel(a);
        // the challenger of an expired one: by the challenger (0)
        uint256 b = _challenge(alice, address(froks), 1, STAKE, address(0));
        vm.warp(block.timestamp + 24 hours);
        vm.expectEmit(address(club));
        emit FightClub.ChallengeCancelled(b, alice, 0);
        vm.prank(alice);
        club.cancel(b);
        // pet gone AND dead: gone wins (2)
        uint256 c = _challenge(bob, address(sahurs), 1, STAKE, address(0));
        vm.prank(bob);
        sahurs.transferFrom(bob, alt, 1);
        sahurs.kill(1);
        vm.expectEmit(address(club));
        emit FightClub.ChallengeCancelled(c, dave, 2);
        vm.prank(dave);
        club.cancel(c);
        // dead, still owned: dead (3)
        uint256 d = _challenge(bob, address(cats), 2, STAKE, address(0));
        cats.kill(2);
        vm.expectEmit(address(club));
        emit FightClub.ChallengeCancelled(d, dave, 3);
        vm.prank(dave);
        club.cancel(d);
        assertEq(club.openCount(), 0);
        _solvent();
    }

    // ================================================================ both sides, one person

    /// One person, two wallets, two pets: allowed (nothing on chain can tell), and it costs them the 5% and the fee.
    function test_sameWalletBothSidesThroughAnAlt_costsTheFee() public {
        vm.prank(alice);
        froks.transferFrom(alice, alt, 1);
        uint256 w0 = alice.balance + alt.balance;
        uint256 id = _challenge(alice, address(cats), 1, STAKE, alt);
        uint64 seq = _accept(alt, id, address(froks), 1);
        entropy.reveal(seq, EVEN);
        assertEq(w0 - (alice.balance + alt.balance), STAKE / 10 + FEE, "a wash fight costs the cut and Pyth's fee");
        assertEq(club.recordOf(address(cats), 1).wins, 1);
        assertEq(club.recordOf(address(froks), 1).losses, 1);
        _solvent();
    }

    /// A direct challenge is not in the named opponent's `fightsOf`: they find it only through the open list.
    function test_directChallenge_notInOpponentsFightsOf() public {
        uint256 id = _challenge(alice, address(cats), 1, STAKE, bob);
        assertEq(club.fightCountOf(bob), 0, "the named opponent's list does not carry it");
        assertEq(club.fightCountOf(alice), 1);
        FightClub.FightView[] memory page = club.openChallenges(0, 10);
        assertEq(page.length, 1);
        assertEq(page[0].opponent, bob, "it is in the open list, with the opponent on it");
        _accept(bob, id, address(sahurs), 1);
        assertEq(club.fightCountOf(bob), 1, "and in the acceptor's list once accepted");
    }

    // ================================================================ front-running

    /// The challenger cancels (or moves the pet) just before an accept lands: the acceptor's tx reverts whole (the
    /// value goes back with the revert), only its gas is lost. And a second acceptor is refused: first come.
    function test_frontRunAccept_acceptorLosesNothingButGas() public {
        uint256 id = _challenge(alice, address(cats), 1, STAKE, address(0));
        uint256 b0 = bob.balance;
        vm.prank(alice);
        club.cancel(id);
        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(FightClub.NotOpen.selector, id));
        club.accept{value: STAKE + FEE}(id, address(sahurs), 1);
        assertEq(bob.balance, b0);
        uint256 id2 = _challenge(alice, address(cats), 1, STAKE, address(0));
        _accept(bob, id2, address(sahurs), 1);
        vm.prank(carol);
        vm.expectRevert(abi.encodeWithSelector(FightClub.NotOpen.selector, id2));
        club.accept{value: STAKE + FEE}(id2, address(froks), 2);
        _solvent();
    }

    // ================================================================ the open list and the locks, interleaved

    uint256 constant N_PETS = 12;
    address[4] wallets;

    /// 400 pseudo-random steps of challenge / cancel (by the challenger, by a stranger after TTL, after a transfer) /
    /// accept / reveal / abort / transfer / warp over 12 pets. After every step: the open list holds exactly the ids
    /// whose status is Open, in a consistent order (paged one at a time); every pet's `activeFightOf` is the id of its
    /// open or pending fight, or 0; the books balance.
    function test_openListAndLocks_interleaved_seedA() public {
        _walk(0xC0FFEE);
    }

    function test_openListAndLocks_interleaved_seedB() public {
        _walk(0xBEEF);
    }

    function test_openListAndLocks_interleaved_seedC() public {
        _walk(7);
    }

    function _walk(uint256 seed) internal {
        wallets = [alice, bob, carol, dave];
        // 12 more cats, three per wallet (ids 3..14)
        for (uint256 i = 0; i < N_PETS; i++) {
            cats.mint(wallets[i % 4]);
        }
        for (uint256 step = 0; step < 400; step++) {
            seed = uint256(keccak256(abi.encode(seed, step)));
            uint256 pet = 3 + (seed % N_PETS);
            address owner = cats.ownerOf(pet);
            uint256 op = (seed >> 8) % 8;
            uint256 busy = club.activeFightOf(address(cats), pet);
            if (op == 0 || op == 1) {
                // challenge with a free pet
                if (busy == 0) {
                    address opp = (seed >> 16) % 3 == 0 ? wallets[(seed >> 24) % 4] : address(0);
                    if (opp == owner) opp = address(0);
                    _challenge(owner, address(cats), pet, 1 ether + (seed >> 32) % 5 ether, opp);
                }
            } else if (op == 2) {
                // cancel by the challenger
                if (busy != 0 && _status(busy) == FightClub.Status.Open) {
                    vm.prank(club.fight(busy).challenger);
                    club.cancel(busy);
                }
            } else if (op == 3) {
                // accept an open challenge with this pet, if it may
                uint256 id = _anyOpen(seed);
                if (id != 0 && busy == 0) {
                    FightClub.FightView memory v = club.fight(id);
                    bool may = v.challenger != owner && (v.opponent == address(0) || v.opponent == owner)
                        && block.timestamp < v.expiresAt && cats.ownerOf(v.challengerPet) == v.challenger;
                    if (may) _accept(owner, id, address(cats), pet);
                }
            } else if (op == 4) {
                // reveal a pending fight
                if (busy != 0 && _status(busy) == FightClub.Status.Pending) {
                    entropy.reveal(club.fight(busy).sequence, bytes32(seed));
                }
            } else if (op == 5) {
                // transfer the pet to another wallet (mid anything)
                address to = wallets[(seed >> 40) % 4];
                if (to != owner) {
                    vm.prank(owner);
                    cats.transferFrom(owner, to, pet);
                }
                // a stranger cancels whatever became cancellable
                if (busy != 0 && _status(busy) == FightClub.Status.Open) {
                    FightClub.FightView memory v = club.fight(busy);
                    if (cats.ownerOf(v.challengerPet) != v.challenger || block.timestamp >= v.expiresAt) {
                        vm.prank(dave);
                        club.cancel(busy);
                    }
                }
            } else if (op == 6) {
                // time passes (a little, most of the time; a day now and then); abort what has timed out
                vm.warp(block.timestamp + 10 minutes + (seed >> 48) % ((seed >> 60) % 5 == 0 ? 25 hours : 3 hours));
                if (busy != 0 && _status(busy) == FightClub.Status.Pending) {
                    if (block.timestamp >= club.fight(busy).abortableAt) {
                        vm.prank(dave);
                        club.abort(busy);
                    }
                }
            } else {
                // a stranger cancels an expired one, if any
                uint256 id = _anyOpen(seed);
                if (id != 0 && block.timestamp >= club.fight(id).expiresAt) {
                    vm.prank(dave);
                    club.cancel(id);
                }
            }
            // every 8th step (EVM memory is never freed inside one test; the full scan every step ran out of it)
            if (step % 8 == 7) _checkListsAndLocks();
        }
        _checkListsAndLocks();
        // and at the end every fight is in a terminal or live state consistent with the list
        uint256[6] memory byStatus;
        for (uint256 id = 1; id <= club.fightCount(); id++) byStatus[uint8(_status(id))]++;
        console.log("fights made", club.fightCount(), "open now", club.openCount());
        console.log("cancelled", byStatus[2], "pending", byStatus[3]);
        console.log("fought", byStatus[4], "aborted", byStatus[5]);
        assertGt(club.fightCount(), 40, "the walk did make fights");
        assertGt(byStatus[4], 5, "some were fought");
        assertGt(byStatus[2], 5, "some were cancelled");
    }

    function _anyOpen(uint256 seed) internal view returns (uint256) {
        uint256 n = club.openCount();
        if (n == 0) return 0;
        return club.openChallenges((seed >> 56) % n, 1)[0].id;
    }

    function _checkListsAndLocks() internal view {
        uint256 total = club.fightCount();
        uint256 openN = club.openCount();
        // every listed id is Open, listed once, and paging one at a time agrees with the whole page
        FightClub.FightView[] memory page = club.openChallenges(0, openN);
        assertEq(page.length, openN);
        uint256 openSeen;
        for (uint256 i = 0; i < openN; i++) {
            assertEq(uint8(page[i].status), uint8(FightClub.Status.Open), "listed but not open");
            assertEq(club.openChallenges(i, 1)[0].id, page[i].id, "paging disagrees");
            for (uint256 j = 0; j < i; j++) {
                assertTrue(page[j].id != page[i].id, "listed twice");
            }
            openSeen++;
        }
        // every Open fight is listed; every pet's lock is exactly its open/pending fight
        uint256 openCount;
        uint256 openStakes;
        uint256 pendingStakes;
        for (uint256 id = 1; id <= total; id++) {
            FightClub.FightView memory v = club.fight(id);
            if (v.status == FightClub.Status.Open) {
                openCount++;
                openStakes += v.stake;
                assertEq(club.activeFightOf(address(cats), v.challengerPet), id, "open fight, pet not locked to it");
            } else if (v.status == FightClub.Status.Pending) {
                pendingStakes += 2 * v.stake;
                assertEq(club.activeFightOf(address(cats), v.challengerPet), id, "pending, pet A not locked");
                assertEq(club.activeFightOf(address(cats), v.acceptorPet), id, "pending, pet B not locked");
            }
        }
        assertEq(openCount, openSeen, "an Open fight is missing from the list");
        assertEq(club.openStakes(), openStakes, "openStakes");
        assertEq(club.pendingStakes(), pendingStakes, "pendingStakes");
        for (uint256 pet = 1; pet <= 2 + N_PETS; pet++) {
            uint256 lock = club.activeFightOf(address(cats), pet);
            if (lock != 0) {
                FightClub.Status s = _status(lock);
                assertTrue(s == FightClub.Status.Open || s == FightClub.Status.Pending, "stale lock");
                FightClub.FightView memory v = club.fight(lock);
                assertTrue(v.challengerPet == pet || (s == FightClub.Status.Pending && v.acceptorPet == pet), "lock names a fight the pet is not in");
            }
        }
        assertEq(address(club).balance, club.accounted(), "books");
    }

    // ================================================================ lobby spam and list growth

    /// One wallet with 1,000 pets posts 1,000 minimum-stake challenges, then lets them expire. The list stays readable
    /// by page (gas per page of 60 measured); the cost to anyone of clearing an expired entry is one cancel each, and
    /// the spammer's stakes come back to them. Reported as Info: there is no batch cancel and no expiry sweep.
    function test_lobbySpam_pagedReadsStayCheap_clearingIsOneTxEach() public {
        address spammer = makeAddr("spammer");
        vm.deal(spammer, 2_000 ether);
        for (uint256 i = 0; i < 1_000; i++) {
            uint256 pet = froks.mint(spammer);
            vm.prank(spammer);
            club.challenge{value: 1 ether}(address(froks), pet, address(0));
        }
        assertEq(club.openCount(), 1_000);
        uint256 g0 = gasleft();
        FightClub.FightView[] memory page = club.openChallenges(0, 60);
        uint256 gPage = g0 - gasleft();
        assertEq(page.length, 60);
        g0 = gasleft();
        page = club.openChallenges(940, 60);
        uint256 gLast = g0 - gasleft();
        console.log("openChallenges(0,60) gas", gPage, "openChallenges(940,60) gas", gLast);
        assertLt(gPage, 3_000_000, "a page of 60 stays well under any eth_call cap");
        // a real challenge by someone else is buried at the end of the list
        uint256 real = _challenge(alice, address(cats), 1, STAKE, address(0));
        assertEq(club.openChallenges(1_000, 1)[0].id, real);
        // after the TTL anyone may clear them, one transaction each; the stakes go back to the spammer
        vm.warp(T0 + 24 hours);
        uint256 s0 = spammer.balance;
        g0 = gasleft();
        vm.prank(dave);
        club.cancel(1);
        console.log("one stranger cancel gas", g0 - gasleft());
        assertEq(spammer.balance - s0, 1 ether);
        // the spammer can also re-post the same pets straight away (the same MON, over and over); frok 3 was fight 1
        assertEq(club.fight(1).challengerPet, 3);
        vm.prank(spammer);
        club.challenge{value: 1 ether}(address(froks), 3, address(0));
        assertEq(club.openCount(), 1_001);
        _solvent();
    }

    /// `fightsOf` for one wallet grows without bound but is paged; a page of 60 from the end of a 1,000-long list.
    function test_fightsOfGrowth_pagedReadsStayCheap() public {
        for (uint256 i = 0; i < 1_000; i++) {
            uint256 id = _challenge(alice, address(cats), 1, 1 ether, address(0));
            vm.prank(alice);
            club.cancel(id);
        }
        assertEq(club.fightCountOf(alice), 1_000);
        uint256 g0 = gasleft();
        FightClub.FightView[] memory page = club.fightsOf(alice, 940, 60);
        uint256 g = g0 - gasleft();
        console.log("fightsOf(940,60) gas", g);
        assertEq(page.length, 60);
        assertEq(page[59].id, 1_000);
        assertLt(g, 3_000_000);
    }

    // ================================================================ liveness: nothing can be locked for ever

    /// A contract challenger that refuses MON, a contract acceptor that burns gas, both pets sold, Pyth silent: after
    /// the timeout a stranger's abort still frees both pets and every wei is owed to the two stakers.
    function test_liveness_worstFightersAndSoldPets_abortFreesEverything() public {
        Fighter a = new Fighter(club);
        Fighter b = new Fighter(club);
        vm.deal(address(a), 100 ether);
        vm.deal(address(b), 100 ether);
        uint256 petA = cats.mint(address(a));
        uint256 petB = sahurs.mint(address(b));
        uint256 id = a.doChallenge(STAKE, address(cats), petA, address(0));
        b.doAccept(STAKE + FEE, id, address(sahurs), petB);
        a.setMode(1); // refuses
        b.setMode(2); // burns all gas
        cats.kill(petA);
        vm.prank(address(b));
        sahurs.transferFrom(address(b), dave, petB);
        vm.warp(T0 + 24 hours);
        vm.prank(carol);
        club.abort(id);
        assertEq(club.owed(address(a)), STAKE);
        assertEq(club.owed(address(b)), STAKE);
        assertEq(club.activeFightOf(address(cats), petA), 0);
        assertEq(club.activeFightOf(address(sahurs), petB), 0);
        _challenge(dave, address(sahurs), petB, STAKE, address(0));
        b.setMode(0);
        b.doWithdraw();
        a.doWithdrawTo(dave);
        assertEq(club.totalOwed(), 0);
        _solvent();
    }

    /// A collection that stops answering (every call reverts): no stake is stuck. The challenger's own cancel never
    /// calls the game; a stranger's cancel reads the revert as "pet gone" (reason 2) and refunds the challenger; an
    /// accept is refused (ChallengerPetGone); a pending fight settles or aborts without ever reading the game.
    function test_collectionThatRevertsCannotLockAnything() public {
        uint256 a = _challenge(alice, address(cats), 1, STAKE, address(0));
        uint256 b = _challenge(alice, address(froks), 1, STAKE, address(0));
        uint256 p = _challenge(bob, address(cats), 2, STAKE, address(0));
        uint64 seq = _accept(carol, p, address(sahurs), 2);
        vm.etch(address(cats), hex"60006000fd"); // PUSH1 0 PUSH1 0 REVERT
        vm.prank(alice);
        club.cancel(a); // reason 0, no game call
        // froks still answer and alice still owns frok 1: a stranger cannot cancel that one (control)
        vm.prank(dave);
        vm.expectRevert(abi.encodeWithSelector(FightClub.CannotCancel.selector, b));
        club.cancel(b);
        uint256 c = _challenge(carol, address(froks), 2, STAKE, address(0));
        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(FightClub.NotOwner.selector));
        club.accept{value: STAKE + FEE}(c, address(cats), 2); // a dead collection's pets cannot fight
        entropy.reveal(seq, EVEN); // the pending fight settles without reading the game
        assertEq(uint8(_status(p)), uint8(FightClub.Status.Fought));
        assertEq(club.activeFightOf(address(cats), 2), 0);
        _solvent();
    }

    /// Same, for a stranger cancelling a challenge whose collection now reverts: reason 2, refund to the challenger.
    function test_collectionThatReverts_strangerCancelReadsPetGone() public {
        uint256 a = _challenge(alice, address(cats), 1, STAKE, address(0));
        vm.etch(address(cats), hex"60006000fd");
        uint256 a0 = alice.balance;
        vm.expectEmit(address(club));
        emit FightClub.ChallengeCancelled(a, dave, 2);
        vm.prank(dave);
        club.cancel(a);
        assertEq(alice.balance - a0, STAKE);
        _solvent();
    }

    function _one(address col, uint256 id) internal pure returns (address[] memory cols, uint256[] memory ids) {
        cols = new address[](1);
        ids = new uint256[](1);
        cols[0] = col;
        ids[0] = id;
    }
}
