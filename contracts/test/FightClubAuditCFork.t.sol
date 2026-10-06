// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Test, console} from "forge-std/Test.sol";
import {FightClub} from "../src/fightclub/FightClub.sol";

interface IGameC {
    function ownerOf(uint256 id) external view returns (address);
    function totalSupply() external view returns (uint256);
    function transferFrom(address from, address to, uint256 id) external;
    function crownList() external view returns (uint256[] memory, uint256[] memory, uint256[] memory, bool[] memory);
}

/// Audit lens C on a fork of Monad mainnet: the hand-decoded `_ownerOf` / `_alive` against the REAL games' ABI, with
/// real living pets, the same pets once the feed clock has starved them (the games compute `alive` live), and ids that
/// do not exist; and a real ERC-721 transfer between challenge and accept.
///   ~/.foundry/bin/forge test --match-contract FightClubAuditCFork --fork-url https://rpc.monad.xyz -vv
contract FightClubAuditCForkTest is Test {
    address constant ENTROPY = 0xD458261E832415CFd3BAE5E416FdF3230ce6F134;
    address constant TEAM = 0xB7EEE0445afc7651025b06974F3BdeEdf8840439;
    address constant CATS = 0xC0A0808cbAF507b80df92b22feD8D3810eAB45d5;
    address constant FROKS = 0xB841cc9A4058345cc0B5913F9e966F0C06ab49c6;
    address constant SAHURS = 0xc7969C5df0353e4E65B54e3587bD0CaB5d1aF4c7;

    /// The head of the games' View struct (the first five fields; abi.decode reads only what it is asked for).
    struct ViewHead {
        uint256 id;
        address owner;
        string name;
        bool started;
        bool alive;
    }

    FightClub club;
    uint256 fee;

    function setUp() public {
        if (block.chainid != 143) return;
        club = new FightClub(ENTROPY, TEAM, CATS, FROKS, SAHURS);
        fee = club.quote();
    }

    function _anvil(address a) internal pure returns (bool) {
        return a == 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266 || a == 0x70997970C51812dc3A010C7d01b50e0d17dc79C8
            || a == 0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC || a == 0x90F79bf6EB2c4f870365E785982E1f101E93b906
            || a == 0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65 || a == 0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc
            || a == 0x976EA74026E726554dB657fA54763abd0C3a0aa9 || a == 0x14dC79964da2C08b23698B3D3cc7Ca32193d9955
            || a == 0x23618e81E3f5cdF7f54C3d65f7FBc0aBf5B21E8f || a == 0xa0Ee7A142d267C1f36714E4a8F75612F20a79720;
    }

    function _plain(address o, address avoid1, address avoid2) internal view returns (bool) {
        return o != address(0) && o.code.length == 0 && !_anvil(o) && o != TEAM && o != avoid1 && o != avoid2;
    }

    /// The raw `state()` answer and its head decoded by the ABI (the reference the hand-reader must agree with).
    function _state(address col, uint256 id) internal view returns (bool ok, bytes memory ret, ViewHead memory h) {
        (ok, ret) = col.staticcall(abi.encodeWithSignature("state(uint256)", id));
        if (ok) h = abi.decode(ret, (ViewHead));
    }

    /// When the pet starves if nobody feeds it (View.diesAt, head word 23; a fresh pet: startsAt (18) + 48 h).
    function _diesAt(address col, uint256 id) internal view returns (uint256) {
        (bool ok, bytes memory ret,) = _state(col, id);
        require(ok, "state");
        // head words: id0 owner1 name2 started3 alive4 asleep5 poop6 crowned7 crownEligible8 food9 clean10 fun11
        // energy12 mood13 streak14 score15 day16 mintedAt17 startsAt18 bornAt19 deadAt20 poopAt21 wakesAt22 diesAt23
        uint256 diesAt = _w(ret, 0x20 + 23 * 32);
        if (diesAt != 0) return diesAt;
        return _w(ret, 0x20 + 18 * 32) + 48 hours;
    }

    /// A living pet with a plain EOA owner that will not starve before `until`: the crown list first, then the newest
    /// 600 ids (fresh pets are in their welcome week).
    function _living(address col, address avoid1, address avoid2, uint256 until)
        internal
        view
        returns (uint256 id, address who)
    {
        return _livingBetween(col, avoid1, avoid2, until, type(uint256).max);
    }

    /// ... and that starves before `before`.
    function _livingBetween(address col, address avoid1, address avoid2, uint256 until, uint256 before)
        internal
        view
        returns (uint256 id, address who)
    {
        (uint256[] memory ids,,, bool[] memory alive) = IGameC(col).crownList();
        for (uint256 i = 0; i < ids.length; i++) {
            if (!alive[i]) continue;
            try IGameC(col).ownerOf(ids[i]) returns (address o) {
                uint256 d = _diesAt(col, ids[i]);
                if (_plain(o, avoid1, avoid2) && d > until && d < before) return (ids[i], o);
            } catch {}
        }
        uint256 total = IGameC(col).totalSupply();
        for (id = total; id > 0 && id + 600 > total; id--) {
            (bool ok,, ViewHead memory h) = _state(col, id);
            if (!ok || !h.alive) continue;
            uint256 d = _diesAt(col, id);
            if (_plain(h.owner, avoid1, avoid2) && d > until && d < before) return (id, h.owner);
        }
        revert("no living pet with a plain owner in that window");
    }

    /// The living pet with a plain owner that starves FIRST after `until` among the newest 600.
    function _firstToDie(address col, uint256 until) internal view returns (uint256 id, address who, uint256 dies) {
        dies = type(uint256).max;
        uint256 total = IGameC(col).totalSupply();
        for (uint256 i = total; i > 0 && i + 600 > total; i--) {
            (bool ok,, ViewHead memory h) = _state(col, i);
            if (!ok || !h.alive || !_plain(h.owner, address(0), address(0))) continue;
            uint256 d = _diesAt(col, i);
            if (d > until && d < dies) (id, who, dies) = (i, h.owner, d);
        }
        require(id != 0, "no living pet in the newest 600");
    }

    // ---------------------------------------------------------------- the decoder against the real ABI

    /// For each of the three games: the raw layout of `state()` is what `_alive` assumes (offset word, then id,
    /// owner, name offset, started, alive at +128); a living pet is taken; two pets, one of which starves an hour
    /// before the other's challenge expires, exercise ChallengerPetDead, PetDead and cancel reason 3 on the real feed
    /// clock (the death is computed live, nothing on chain has recorded it); ids that do not exist read as not owned.
    function test_fork_aliveDecoder_realGames_livingStarvedAndMissing() public {
        if (block.chainid != 143) return;
        address[3] memory cols = [CATS, FROKS, SAHURS];
        uint256 t0 = block.timestamp;
        for (uint256 c = 0; c < 3; c++) {
            vm.warp(t0);
            address col = cols[c];
            (uint256 early, address ownerE, uint256 dE) = _firstToDie(col, t0 + 23 hours);
            (uint256 late, address ownerL) = _living(col, ownerE, address(0), dE); // outlives it
            assertGt(_diesAt(col, late), dE, "the late pet outlives the early one");
            console.log("collection", col);
            console.log("early pet", early, "dies at", dE);
            console.log("late pet", late, "dies at", _diesAt(col, late));

            // the layout, word by word, against the ABI decoder
            (bool ok, bytes memory ret, ViewHead memory h) = _state(col, early);
            assertTrue(ok && ret.length >= 192);
            assertEq(_w(ret, 0), 0x20, "the struct's offset");
            assertEq(_w(ret, 0x20), early, "head word 0 is the id");
            assertEq(_w(ret, 0x40), uint256(uint160(ownerE)), "head word 1 is the owner");
            assertTrue(_w(ret, 0x60) >= 160, "head word 2 is the name's offset");
            assertEq(_w(ret, 0xa0), 1, "head word 4 is alive == 1");
            assertTrue(h.alive && h.owner == ownerE && h.id == early);

            vm.deal(ownerE, ownerE.balance + 10 ether);
            vm.deal(ownerL, ownerL.balance + 10 ether);
            address stranger = makeAddr("stranger");
            vm.deal(stranger, 1 ether);

            // a third pet, alive past dE, whose challenge the dead pet will try to accept
            (uint256 third, address ownerT) = _living(col, ownerE, ownerL, dE);
            vm.deal(ownerT, ownerT.balance + 10 ether);
            // 23 h before the early pet starves, the early and the third challenge (both alive: taken)
            vm.warp(dE - 23 hours);
            vm.prank(ownerE);
            uint256 fidE = club.challenge{value: 1 ether}(col, early, address(0));
            vm.prank(ownerT);
            uint256 fidL = club.challenge{value: 1 ether}(col, third, address(0));

            // the second the early pet starves: dead by the live clock, still owned, nothing recorded on chain
            vm.warp(dE);
            (, ret, h) = _state(col, early);
            assertFalse(h.alive, "the game computes dead");
            assertEq(_w(ret, 0xa0), 0, "alive word is 0");
            assertEq(IGameC(col).ownerOf(early), ownerE, "still owned");
            (,, ViewHead memory hl) = _state(col, late);
            assertTrue(hl.alive, "the late pet is alive");
            // its challenge cannot be accepted
            vm.prank(ownerL);
            vm.expectRevert(abi.encodeWithSelector(FightClub.ChallengerPetDead.selector, fidE));
            club.accept{value: 1 ether + fee}(fidE, col, late);
            // it cannot accept the other one
            vm.prank(ownerE);
            vm.expectRevert(abi.encodeWithSelector(FightClub.PetDead.selector, col, early));
            club.accept{value: 1 ether + fee}(fidL, col, early);
            // a stranger cancels the dead pet's challenge: reason 3, the stake back to its challenger
            uint256 e0 = ownerE.balance;
            vm.expectEmit(address(club));
            emit FightClub.ChallengeCancelled(fidE, stranger, 3);
            vm.prank(stranger);
            club.cancel(fidE);
            assertEq(ownerE.balance - e0, 1 ether);
            // and it cannot challenge again
            vm.prank(ownerE);
            vm.expectRevert(abi.encodeWithSelector(FightClub.PetDead.selector, col, early));
            club.challenge{value: 1 ether}(col, early, address(0));
            // the living ones still fight (the live Entropy takes the request)
            vm.prank(ownerL);
            club.accept{value: 1 ether + fee}(fidL, col, late);
            assertEq(uint8(club.fight(fidL).status), uint8(FightClub.Status.Pending));

            // ids that do not exist: ownerOf reverts, read as not owned; state() reverts too
            vm.warp(t0);
            uint256 none = IGameC(col).totalSupply() + 1;
            vm.prank(ownerL);
            vm.expectRevert(FightClub.NotOwner.selector);
            club.challenge{value: 1 ether}(col, none, address(0));
            vm.prank(ownerL);
            vm.expectRevert(FightClub.NotOwner.selector);
            club.challenge{value: 1 ether}(col, 0, address(0));
            (ok,,) = _state(col, none);
            assertFalse(ok, "state() reverts for a token that does not exist");
            assertEq(address(club).balance, club.accounted());
        }
    }

    // ---------------------------------------------------------------- a real transfer mid-flow

    function test_fork_realTransferBetweenChallengeAndAccept() public {
        if (block.chainid != 143) return;
        (uint256 id, address owner) = _living(CATS, address(0), address(0), block.timestamp + 2 hours);
        (uint256 idB, address ownerB) = _living(FROKS, owner, address(0), block.timestamp + 2 hours);
        vm.deal(owner, owner.balance + 10 ether);
        vm.deal(ownerB, ownerB.balance + 10 ether);
        vm.prank(owner);
        uint256 fid = club.challenge{value: 1 ether}(CATS, id, address(0));
        address buyer = makeAddr("buyer");
        vm.deal(buyer, 10 ether);
        vm.prank(owner);
        IGameC(CATS).transferFrom(owner, buyer, id);
        assertEq(IGameC(CATS).ownerOf(id), buyer);
        (,, ViewHead memory h) = _state(CATS, id);
        assertEq(h.owner, buyer, "state() names the buyer");
        assertTrue(h.alive, "a transfer does not touch the clock");
        vm.prank(ownerB);
        vm.expectRevert(abi.encodeWithSelector(FightClub.ChallengerPetGone.selector, fid));
        club.accept{value: 1 ether + fee}(fid, FROKS, idB);
        vm.prank(buyer);
        vm.expectRevert(abi.encodeWithSelector(FightClub.PetBusy.selector, fid));
        club.challenge{value: 1 ether}(CATS, id, address(0));
        uint256 o0 = owner.balance;
        vm.expectEmit(address(club));
        emit FightClub.ChallengeCancelled(fid, buyer, 2);
        vm.prank(buyer);
        club.cancel(fid);
        assertEq(owner.balance - o0, 1 ether, "the refund goes to the challenger, not the buyer");
        vm.prank(buyer);
        uint256 fid2 = club.challenge{value: 1 ether}(CATS, id, address(0));
        assertEq(club.activeFightOf(CATS, id), fid2);
        vm.prank(ownerB);
        club.accept{value: 1 ether + fee}(fid2, FROKS, idB);
        assertEq(uint8(club.fight(fid2).status), uint8(FightClub.Status.Pending));
        // sold again mid-pending: the new owner waits for the callback (or the timeout)
        address buyer2 = makeAddr("buyer2");
        vm.deal(buyer2, 10 ether);
        vm.prank(buyer);
        IGameC(CATS).transferFrom(buyer, buyer2, id);
        vm.prank(buyer2);
        vm.expectRevert(abi.encodeWithSelector(FightClub.PetBusy.selector, fid2));
        club.challenge{value: 1 ether}(CATS, id, address(0));
        vm.warp(block.timestamp + 24 hours);
        vm.prank(buyer2);
        club.abort(fid2);
        assertEq(club.activeFightOf(CATS, id), 0);
        assertEq(address(club).balance, club.accounted());
    }

    /// The gas the real games' reads cost inside challenge and accept (the callback never reads them).
    function test_fork_gameReadsGas() public {
        if (block.chainid != 143) return;
        (uint256 id, address owner) = _living(CATS, address(0), address(0), block.timestamp + 2 hours);
        (uint256 idB, address ownerB) = _living(SAHURS, owner, address(0), block.timestamp + 2 hours);
        vm.deal(owner, owner.balance + 10 ether);
        vm.deal(ownerB, ownerB.balance + 10 ether);
        vm.prank(owner);
        uint256 g0 = gasleft();
        uint256 fid = club.challenge{value: 1 ether}(CATS, id, address(0));
        console.log("challenge gas (forge schedule)", g0 - gasleft());
        vm.prank(ownerB);
        g0 = gasleft();
        club.accept{value: 1 ether + fee}(fid, SAHURS, idB);
        console.log("accept gas (forge schedule, live Entropy)", g0 - gasleft());
    }

    function _w(bytes memory b, uint256 at) internal pure returns (uint256 w) {
        assembly {
            w := mload(add(add(b, 32), at))
        }
    }
}
