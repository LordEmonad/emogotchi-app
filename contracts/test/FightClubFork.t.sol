// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Test, console} from "forge-std/Test.sol";
import {Vm} from "forge-std/Vm.sol";
import {FightClub} from "../src/fightclub/FightClub.sol";

interface IOwnerOfFork {
    function ownerOf(uint256 id) external view returns (address);
}

/// The live Pyth Entropy's own interface, as much of it as the rehearsal needs (Entropy.sol, read 2026-09-28).
interface IEntropyFork {
    struct Request {
        address provider;
        uint64 sequenceNumber;
        uint32 numHashes;
        bytes32 commitment;
        uint64 blockNumber;
        address requester;
        bool useBlockhash;
        uint8 callbackStatus;
        uint16 gasLimit10k;
    }

    function getDefaultProvider() external view returns (address);
    function getFeeV2(address provider, uint32 gasLimit) external view returns (uint128);
    function getRequestV2(address provider, uint64 sequenceNumber) external view returns (Request memory);
    function getAdmin() external view returns (address);
    function register(
        uint128 feeInWei,
        bytes32 commitment,
        bytes calldata commitmentMetadata,
        uint64 chainLength,
        bytes calldata uri
    ) external;
    function setDefaultGasLimit(uint32 gasLimit) external;
    function setDefaultProvider(address provider) external;
    function revealWithCallback(
        address provider,
        uint64 sequenceNumber,
        bytes32 userContribution,
        bytes32 providerContribution
    ) external;
}

/// Fight Club against the live Pyth Entropy and the three live pet collections on a fork of Monad mainnet, with real
/// pet owners. Nothing is sent to the real chain. Runs only against a fork:
///   ~/.foundry/bin/forge test --match-contract FightClubFork --fork-url https://rpc.monad.xyz -vv
///
/// Two ways the answer comes back: (1) Pyth's real keeper cannot answer a request made on a fork, so most tests stand
/// in for it by calling `_entropyCallback` as the Entropy contract; (2) `test_fork_realRevealThroughPyth` registers a
/// provider of its own on the fork (a hash chain it knows), makes it the default with the Entropy admin's key, and
/// answers through Entropy's own `revealWithCallback`, so Pyth's real code runs the callback with its real gas limit.
interface ITotalFork {
    function totalSupply() external view returns (uint256);
}

interface ICrownFork {
    function crownList() external view returns (uint256[] memory, uint256[] memory, uint256[] memory, bool[] memory);
}

contract FightClubForkTest is Test {
    IEntropyFork constant ENTROPY = IEntropyFork(0xD458261E832415CFd3BAE5E416FdF3230ce6F134);
    address constant PROVIDER = 0x52DeaA1c84233F7bb8C8A45baeDE41091c616506;
    address constant TEAM = 0xB7EEE0445afc7651025b06974F3BdeEdf8840439;
    address constant CATS = 0xC0A0808cbAF507b80df92b22feD8D3810eAB45d5;
    address constant FROKS = 0xB841cc9A4058345cc0B5913F9e966F0C06ab49c6;
    address constant SAHURS = 0xc7969C5df0353e4E65B54e3587bD0CaB5d1aF4c7;
    bytes32 constant REQUESTED_V2 = keccak256("Requested(address,address,uint64,bytes32,uint32,bytes)");

    FightClub club;

    function setUp() public {
        if (block.chainid != 143) return;
        club = new FightClub(address(ENTROPY), TEAM, CATS, FROKS, SAHURS);
    }

    // ---------------------------------------------------------------- finding real owners
    /// anvil's ten default accounts: never use them (some carry EIP-7702 code on Monad mainnet)
    function _anvil(address a) internal pure returns (bool) {
        return a == 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266 || a == 0x70997970C51812dc3A010C7d01b50e0d17dc79C8
            || a == 0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC || a == 0x90F79bf6EB2c4f870365E785982E1f101E93b906
            || a == 0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65 || a == 0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc
            || a == 0x976EA74026E726554dB657fA54763abd0C3a0aa9 || a == 0x14dC79964da2C08b23698B3D3cc7Ca32193d9955
            || a == 0x23618e81E3f5cdF7f54C3d65f7FBc0aBf5B21E8f || a == 0xa0Ee7A142d267C1f36714E4a8F75612F20a79720;
    }

    /// A plain EOA owner of a LIVING pet of `col`, not in `avoid` (dead pets do not fight, and after the Great
    /// Starvation almost every low id is dead): the pets on the game's crown list that it says are alive, from the
    /// `start`-th on.
    function _owner(address col, uint256 start, address avoid1, address avoid2)
        internal
        view
        returns (uint256 id, address who)
    {
        (uint256[] memory ids,,, bool[] memory alive) = ICrownFork(col).crownList();
        for (uint256 i = start - 1; i < ids.length; i++) {
            if (!alive[i]) continue;
            id = ids[i];
            try IOwnerOfFork(col).ownerOf(id) returns (address o) {
                if (o == address(0) || o.code.length != 0 || _anvil(o) || o == avoid1 || o == avoid2) continue;
                if (o == TEAM) continue;
                return (id, o);
            } catch {}
        }
        // a young collection's crown list is empty (a pet needs a week of history to be on it): the newest pets
        uint256 total = ITotalFork(col).totalSupply();
        uint256 skip = start - 1;
        for (id = total; id > 0 && id + 300 > total; id--) {
            if (!_isAlive(col, id)) continue;
            try IOwnerOfFork(col).ownerOf(id) returns (address o) {
                if (o == address(0) || o.code.length != 0 || _anvil(o) || o == avoid1 || o == avoid2 || o == TEAM) continue;
                if (skip > 0) { skip--; continue; }
                return (id, o);
            } catch {}
        }
        revert("no plain owner of a living pet found");
    }

    function _isAlive(address col, uint256 id) internal view returns (bool) {
        (bool ok, bytes memory ret) = col.staticcall(abi.encodeWithSignature("state(uint256)", id));
        if (!ok || ret.length < 192) return false;
        uint256 head = abi.decode(ret, (uint256));
        uint256 alive;
        assembly {
            alive := mload(add(add(ret, 32), add(head, 128)))
        }
        return alive == 1;
    }

    /// A pet that is dead now, and its plain EOA owner.
    function _deadPet(address col) internal view returns (uint256 id, address who) {
        for (id = 1; id < 200; id++) {
            try IOwnerOfFork(col).ownerOf(id) returns (address o) {
                if (o == address(0) || o.code.length != 0 || _anvil(o) || o == TEAM) continue;
                (bool ok, bytes memory ret) = col.staticcall(abi.encodeWithSignature("state(uint256)", id));
                if (!ok || ret.length < 192) continue;
                uint256 head = abi.decode(ret, (uint256));
                uint256 alive;
                assembly {
                    alive := mload(add(add(ret, 32), add(head, 128)))
                }
                if (alive == 0) return (id, o);
            } catch {}
        }
        revert("no dead pet found");
    }

    function test_fork_deadPetIsRefused() public {
        if (block.chainid != 143) return;
        (uint256 deadId, address a) = _deadPet(CATS);
        console.log("dead cat", deadId, a);
        vm.deal(a, a.balance + 100 ether);
        vm.prank(a);
        vm.expectRevert(abi.encodeWithSelector(FightClub.PetDead.selector, CATS, deadId));
        club.challenge{value: 5 ether}(CATS, deadId, address(0));
        // and a living one may
        (uint256 liveId, address b) = _owner(CATS, 1, a, address(0));
        vm.deal(b, b.balance + 100 ether);
        vm.prank(b);
        club.challenge{value: 5 ether}(CATS, liveId, address(0));
    }

    function _wealth(address a) internal view returns (uint256) {
        return a.balance + club.owed(a);
    }

    // ---------------------------------------------------------------- the rehearsals
    function test_fork_fightAgainstTheLiveEntropy() public {
        if (block.chainid != 143) return;
        address provider = ENTROPY.getDefaultProvider();
        console.log("default provider", provider);
        uint256 fee = club.quote();
        assertEq(fee, ENTROPY.getFeeV2(provider, 1_000_000), "quote == the live fee for 1M callback gas");
        console.log("quote (wei)", fee);

        (uint256 catId, address a) = _owner(CATS, 1, address(0), address(0));
        (uint256 sahurId, address b) = _owner(SAHURS, 1, a, address(0));
        console.log("cat", catId, a);
        console.log("sahur", sahurId, b);
        vm.deal(a, a.balance + 100 ether);
        vm.deal(b, b.balance + 100 ether);

        uint256 g = gasleft();
        vm.prank(a);
        uint256 id = club.challenge{value: 5 ether}(CATS, catId, address(0));
        console.log("challenge gas (EVM schedule, one tx: warm after first touch)", g - gasleft());

        uint256 entropyBefore = address(ENTROPY).balance;
        uint256 bBefore = b.balance;
        vm.recordLogs();
        vm.prank(b);
        g = gasleft();
        uint64 seq = club.accept{value: 5 ether + fee + 1 ether}(id, SAHURS, sahurId);
        console.log("accept gas (EVM schedule)", g - gasleft());
        assertEq(address(ENTROPY).balance - entropyBefore, fee, "exactly the fee went to Pyth");
        assertEq(bBefore - b.balance, 5 ether + fee, "the 1 MON over came back");

        // Pyth took the request as ours, with a 1,000,000 callback limit, waiting for its keeper
        IEntropyFork.Request memory r = ENTROPY.getRequestV2(provider, seq);
        assertEq(r.requester, address(club));
        assertEq(r.sequenceNumber, seq);
        assertEq(r.provider, provider);
        assertEq(r.callbackStatus, 1, "CALLBACK_NOT_STARTED");
        assertEq(r.gasLimit10k, 100, "1,000,000 gas");
        assertFalse(r.useBlockhash);
        Vm.Log[] memory logs = vm.getRecordedLogs();
        bool seen;
        for (uint256 i = 0; i < logs.length; i++) {
            if (logs[i].emitter == address(ENTROPY) && logs[i].topics[0] == REQUESTED_V2) {
                assertEq(uint64(uint256(logs[i].topics[3])), seq);
                seen = true;
            }
        }
        assertTrue(seen, "Entropy emitted Requested for our sequence");
        assertEq(club.fightOfRequest(provider, seq), id);

        // Pyth answers (standing in for its keeper): even, so the cat's owner wins
        uint256 aBefore = a.balance;
        vm.prank(address(ENTROPY));
        g = gasleft();
        club._entropyCallback{gas: 1_000_000}(seq, provider, bytes32(uint256(42)));
        console.log("callback gas (EVM schedule)", g - gasleft());
        assertEq(a.balance - aBefore, 9.5 ether, "2 x 5 minus 5%");
        assertEq(club.teamOwed(), 0.5 ether);
        assertEq(club.fight(id).winner, a);
        assertEq(club.recordOf(CATS, catId).wins, 1);
        assertEq(club.recordOf(SAHURS, sahurId).losses, 1);

        // the team's cut reaches the real team wallet (an EIP-7702 account: its delegate takes MON)
        uint256 tBefore = TEAM.balance;
        club.sweep();
        assertEq(TEAM.balance - tBefore, 0.5 ether);
        assertEq(address(club).balance, 0);
        assertEq(club.accounted(), 0);
    }

    function test_fork_directChallenge_frokVsCat_acceptorWins() public {
        if (block.chainid != 143) return;
        (uint256 frokId, address a) = _owner(FROKS, 1, address(0), address(0));
        (uint256 catId, address b) = _owner(CATS, 1, a, address(0));
        vm.deal(a, a.balance + 2_000 ether);
        vm.deal(b, b.balance + 2_000 ether);
        vm.prank(a);
        uint256 id = club.challenge{value: 1_000 ether}(FROKS, frokId, b);
        // someone else cannot take a direct challenge
        (uint256 sahurId, address c) = _owner(SAHURS, 1, a, b);
        vm.deal(c, c.balance + 2_000 ether);
        uint256 fee = club.quote();
        vm.prank(c);
        vm.expectRevert(abi.encodeWithSelector(FightClub.NotOpponent.selector, b));
        club.accept{value: 1_000 ether + fee}(id, SAHURS, sahurId);
        vm.prank(b);
        uint64 seq = club.accept{value: 1_000 ether + fee}(id, CATS, catId);
        uint256 bBefore = _wealth(b);
        address provider = ENTROPY.getDefaultProvider();
        vm.prank(address(ENTROPY));
        club._entropyCallback{gas: 1_000_000}(seq, provider, bytes32(uint256(7)));
        assertEq(_wealth(b) - bBefore, 1_900 ether);
        assertEq(club.teamOwed(), 100 ether);
        assertEq(club.fight(id).winner, b);
    }

    function test_fork_abortWhenPythIsSilent() public {
        if (block.chainid != 143) return;
        (uint256 catId, address a) = _owner(CATS, 1, address(0), address(0));
        (uint256 frokId, address b) = _owner(FROKS, 1, a, address(0));
        vm.deal(a, a.balance + 100 ether);
        vm.deal(b, b.balance + 100 ether);
        vm.prank(a);
        uint256 id = club.challenge{value: 3 ether}(CATS, catId, address(0));
        uint256 fee = club.quote();
        vm.prank(b);
        uint64 seq = club.accept{value: 3 ether + fee}(id, FROKS, frokId);
        vm.prank(a);
        vm.expectRevert();
        club.abort(id);
        vm.warp(block.timestamp + 24 hours);
        uint256 a0 = a.balance;
        uint256 b0 = b.balance;
        vm.prank(a);
        club.abort(id);
        assertEq(a.balance - a0, 3 ether);
        assertEq(b.balance - b0, 3 ether);
        // the keeper wakes up late: refused
        address provider = ENTROPY.getDefaultProvider();
        vm.prank(address(ENTROPY));
        vm.expectRevert(abi.encodeWithSelector(FightClub.NotPending.selector, id));
        club._entropyCallback{gas: 1_000_000}(seq, provider, bytes32(uint256(1)));
        assertEq(address(club).balance, 0);
    }

    // state for the end-to-end rehearsal (kept in storage: the test is too big for the stack otherwise)
    address prov;
    bytes32[] chain; // chain[i-1] = keccak(chain[i]); chain[0] is the commitment
    uint256 rId;
    uint64 rSeq;
    address rA;
    address rB;
    uint256 rCat;
    uint256 rSahur;

    function _forkProvider() internal {
        // a provider of our own: a hash chain of 21 values, committed at chain[0], made the default
        prov = makeAddr("fork-provider");
        uint256 len = 20;
        chain = new bytes32[](len + 1);
        chain[len] = keccak256("fight club fork provider secret");
        for (uint256 i = len; i > 0; i--) {
            chain[i - 1] = keccak256(bytes.concat(chain[i]));
        }
        vm.startPrank(prov);
        ENTROPY.register(0.4 ether, chain[0], "", uint64(len + 1), "");
        ENTROPY.setDefaultGasLimit(1_000_000);
        vm.stopPrank();
        vm.prank(ENTROPY.getAdmin());
        ENTROPY.setDefaultProvider(prov);
        assertEq(ENTROPY.getDefaultProvider(), prov);
    }

    function _forkFight() internal returns (bytes32 userContribution) {
        (rCat, rA) = _owner(CATS, 1, address(0), address(0));
        (rSahur, rB) = _owner(SAHURS, 1, rA, address(0));
        vm.deal(rA, rA.balance + 100 ether);
        vm.deal(rB, rB.balance + 100 ether);
        uint256 fee = club.quote();
        console.log("fee with the fork provider", fee);
        vm.prank(rA);
        rId = club.challenge{value: 7 ether}(CATS, rCat, address(0));
        vm.recordLogs();
        vm.prank(rB);
        rSeq = club.accept{value: 7 ether + fee}(rId, SAHURS, rSahur);
        assertEq(rSeq, 1, "the first request to a fresh provider");
        userContribution = _userContribution(vm.getRecordedLogs());
    }

    /// Pyth's real code, end to end: a provider of our own on the fork answers through `revealWithCallback`.
    function test_fork_realRevealThroughPyth() public {
        if (block.chainid != 143) return;
        _forkProvider();
        bytes32 u = _forkFight();
        bytes32 p = chain[rSeq];
        // what the random number will be (Pyth's combineRandomValues, no blockhash)
        bytes32 random = keccak256(abi.encodePacked(u, p, bytes32(0)));
        address winner = uint256(random) % 2 == 0 ? rA : rB;
        console.log("the fight's random number is even:", uint256(random) % 2 == 0);

        // a keeper (or a loser) that sends too little gas cannot starve the callback into failing: at every gas from
        // 60k to 1.2M, the reveal either settles the fight or reverts whole. It never leaves the request marked failed
        // (which would publish the number with the fight still pending, and open the abort window to the loser).
        uint256 settled;
        uint256 reverted;
        for (uint256 g = 60_000; g <= 1_200_000; g += 20_000) {
            uint256 snap = vm.snapshotState();
            try ENTROPY.revealWithCallback{gas: g}(prov, rSeq, u, p) {
                assertEq(uint8(club.fight(rId).status), uint8(FightClub.Status.Fought), "revealed means settled");
                settled++;
            } catch {
                assertEq(uint8(club.fight(rId).status), uint8(FightClub.Status.Pending));
                assertEq(ENTROPY.getRequestV2(prov, rSeq).callbackStatus, 1, "still CALLBACK_NOT_STARTED");
                reverted++;
            }
            vm.revertToState(snap);
        }
        console.log("reveal gas sweep: settled / reverted whole", settled, reverted);
        assertGt(settled, 0);
        assertGt(reverted, 0);

        uint256 wBefore = _wealth(winner);
        vm.recordLogs();
        ENTROPY.revealWithCallback{gas: 2_000_000}(prov, rSeq, u, p);
        // Entropy's own Revealed event: the callback did not fail, and how much gas it used
        _checkRevealed(vm.getRecordedLogs(), random);
        assertEq(uint8(club.fight(rId).status), uint8(FightClub.Status.Fought));
        assertEq(club.fight(rId).random, random);
        assertEq(club.fight(rId).winner, winner);
        assertEq(_wealth(winner) - wBefore, 13.3 ether, "2 x 7 minus 5%");
        assertEq(club.teamOwed(), 0.7 ether);
        // the request is gone from Pyth: it cannot be answered again
        vm.expectRevert();
        ENTROPY.revealWithCallback(prov, rSeq, u, p);
    }

    function _userContribution(Vm.Log[] memory logs) internal pure returns (bytes32 u) {
        for (uint256 i = 0; i < logs.length; i++) {
            if (logs[i].emitter == address(ENTROPY) && logs[i].topics[0] == REQUESTED_V2) {
                u = abi.decode(logs[i].data, (bytes32)); // the first word: userContribution
            }
        }
    }

    function _checkRevealed(Vm.Log[] memory logs, bytes32 random) internal pure {
        bytes32 revealedV2 =
            keccak256("Revealed(address,address,uint64,bytes32,bytes32,bytes32,bool,bytes,uint32,bytes)");
        bool seen;
        for (uint256 i = 0; i < logs.length; i++) {
            if (logs[i].emitter == address(ENTROPY) && logs[i].topics[0] == revealedV2) {
                // the head words: randomNumber, userContribution, providerContribution, callbackFailed,
                // (offset of callbackReturnValue), callbackGasUsed
                (bytes32 rn,,, bool failed,, uint32 used) =
                    abi.decode(logs[i].data, (bytes32, bytes32, bytes32, bool, uint256, uint32));
                assertEq(rn, random);
                assertFalse(failed, "callback did not fail");
                console.log("callback gas as Pyth measured it (EVM schedule)", used);
                seen = true;
            }
        }
        assertTrue(seen, "Entropy emitted Revealed");
    }

    /// For the Monad gas measurement (test/tools/fightclub-monad-gas.mjs): the runtime code and every storage slot
    /// Fight Club wrote, after (0) deploy, (1) one open challenge, (2) two, (3) one accepted, so each call can be
    /// estimated on the real Monad node with eth_estimateGas and a state override. Prints only; changes nothing.
    function test_fork_dumpStateForMonadGas() public {
        if (block.chainid != 143) return;
        (uint256 catId, address a) = _owner(CATS, 1, address(0), address(0));
        (uint256 sahurId, address b) = _owner(SAHURS, 1, a, address(0));
        (uint256 frokId, address c) = _owner(FROKS, 1, a, b);
        console.log("CODE", vm.toString(address(club).code));
        console.log("PETS cat", catId, a);
        console.log("PETS sahur", sahurId, b);
        console.log("PETS frok", frokId, c);
        vm.deal(a, a.balance + 100 ether);
        vm.deal(b, b.balance + 100 ether);
        vm.deal(c, c.balance + 100 ether);
        vm.record();
        _dump("S0");
        vm.prank(c);
        club.challenge{value: 5 ether}(FROKS, frokId, address(0)); // an earlier challenge, so the next is typical
        _dump("S1");
        vm.prank(a);
        uint256 id = club.challenge{value: 5 ether}(CATS, catId, address(0));
        _dump("S2");
        uint256 fee = club.quote();
        vm.prank(b);
        uint64 seq = club.accept{value: 5 ether + fee}(id, SAHURS, sahurId);
        _dump("S3");
        console.log("SEQ", seq, id);
    }

    function _dump(string memory tag) internal {
        (, bytes32[] memory writes) = vm.accesses(address(club));
        for (uint256 i = 0; i < writes.length; i++) {
            bool dup;
            for (uint256 j = 0; j < i; j++) {
                if (writes[j] == writes[i]) dup = true;
            }
            if (dup) continue;
            console.log(
                string.concat(tag, " ", vm.toString(writes[i]), " ", vm.toString(vm.load(address(club), writes[i])))
            );
        }
    }
}
