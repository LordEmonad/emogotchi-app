// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Test, console} from "forge-std/Test.sol";
import {Vm} from "forge-std/Vm.sol";
import {FightClub} from "../src/fightclub/FightClub.sol";

/// Pyth Entropy v2 integration audit (2026-09-30): every test drives the LIVE Entropy bytecode on a fork of Monad
/// mainnet. Run:
///   ~/.foundry/bin/forge test --match-contract FightClubPythAudit --fork-url https://rpc.monad.xyz -vv
interface IOwnerOfA {
    function ownerOf(uint256 id) external view returns (address);
}

interface ICrownA {
    function crownList() external view returns (uint256[] memory, uint256[] memory, uint256[] memory, bool[] memory);
}

interface ITotalA {
    function totalSupply() external view returns (uint256);
}

interface IEntropyA {
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

    struct ProviderInfo {
        uint128 feeInWei;
        uint128 accruedFeesInWei;
        bytes32 originalCommitment;
        uint64 originalCommitmentSequenceNumber;
        bytes commitmentMetadata;
        bytes uri;
        uint64 endSequenceNumber;
        uint64 sequenceNumber;
        bytes32 currentCommitment;
        uint64 currentCommitmentSequenceNumber;
        address feeManager;
        uint32 maxNumHashes;
        uint32 defaultGasLimit;
    }

    function getDefaultProvider() external view returns (address);
    function getFeeV2(address provider, uint32 gasLimit) external view returns (uint128);
    function getRequestV2(address provider, uint64 sequenceNumber) external view returns (Request memory);
    function getProviderInfoV2(address provider) external view returns (ProviderInfo memory);
    function getAdmin() external view returns (address);
    function requestV2(address provider, uint32 gasLimit) external payable returns (uint64);
    function requestV2() external payable returns (uint64);
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

contract FightClubPythAuditTest is Test {
    IEntropyA constant ENTROPY = IEntropyA(0xD458261E832415CFd3BAE5E416FdF3230ce6F134);
    address constant PROVIDER = 0x52DeaA1c84233F7bb8C8A45baeDE41091c616506;
    address constant TEAM = 0xB7EEE0445afc7651025b06974F3BdeEdf8840439;
    address constant CATS = 0xC0A0808cbAF507b80df92b22feD8D3810eAB45d5;
    address constant FROKS = 0xB841cc9A4058345cc0B5913F9e966F0C06ab49c6;
    address constant SAHURS = 0xc7969C5df0353e4E65B54e3587bD0CaB5d1aF4c7;
    bytes32 constant REQUESTED_V2 = keccak256("Requested(address,address,uint64,bytes32,uint32,bytes)");
    bytes4 constant LAST_REVEALED_TOO_OLD = bytes4(keccak256("LastRevealedTooOld()"));
    bytes4 constant NO_SUCH_REQUEST = bytes4(keccak256("NoSuchRequest()"));

    FightClub club;

    // the fork provider
    address prov;
    bytes32[] chain;

    function setUp() public {
        if (block.chainid != 143) return;
        club = new FightClub(address(ENTROPY), TEAM, CATS, FROKS, SAHURS);
    }

    // ---------------------------------------------------------------- helpers (as in FightClubFork.t.sol)
    function _anvil(address a) internal pure returns (bool) {
        return a == 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266 || a == 0x70997970C51812dc3A010C7d01b50e0d17dc79C8
            || a == 0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC || a == 0x90F79bf6EB2c4f870365E785982E1f101E93b906
            || a == 0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65 || a == 0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc
            || a == 0x976EA74026E726554dB657fA54763abd0C3a0aa9 || a == 0x14dC79964da2C08b23698B3D3cc7Ca32193d9955
            || a == 0x23618e81E3f5cdF7f54C3d65f7FBc0aBf5B21E8f || a == 0xa0Ee7A142d267C1f36714E4a8F75612F20a79720;
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

    function _owner(address col, uint256 start, address avoid1, address avoid2)
        internal
        view
        returns (uint256 id, address who)
    {
        (uint256[] memory ids,,, bool[] memory alive) = ICrownA(col).crownList();
        for (uint256 i = start - 1; i < ids.length; i++) {
            if (!alive[i]) continue;
            id = ids[i];
            try IOwnerOfA(col).ownerOf(id) returns (address o) {
                if (o == address(0) || o.code.length != 0 || _anvil(o) || o == avoid1 || o == avoid2) continue;
                if (o == TEAM) continue;
                return (id, o);
            } catch {}
        }
        uint256 total = ITotalA(col).totalSupply();
        uint256 skip = start - 1;
        for (id = total; id > 0 && id + 300 > total; id--) {
            if (!_isAlive(col, id)) continue;
            try IOwnerOfA(col).ownerOf(id) returns (address o) {
                if (o == address(0) || o.code.length != 0 || _anvil(o) || o == avoid1 || o == avoid2 || o == TEAM) continue;
                if (skip > 0) {
                    skip--;
                    continue;
                }
                return (id, o);
            } catch {}
        }
        revert("no plain owner of a living pet found");
    }

    function _forkProvider(uint256 len) internal {
        prov = makeAddr("audit-provider");
        chain = new bytes32[](len + 1);
        chain[len] = keccak256("audit provider secret");
        for (uint256 i = len; i > 0; i--) {
            chain[i - 1] = keccak256(bytes.concat(chain[i]));
        }
        vm.startPrank(prov);
        ENTROPY.register(0.4 ether, chain[0], "", uint64(len + 1), "");
        ENTROPY.setDefaultGasLimit(1_000_000);
        vm.stopPrank();
        vm.prank(ENTROPY.getAdmin());
        ENTROPY.setDefaultProvider(prov);
    }

    function _userContribution(Vm.Log[] memory logs) internal pure returns (bytes32 u) {
        for (uint256 i = 0; i < logs.length; i++) {
            if (logs[i].emitter == address(ENTROPY) && logs[i].topics[0] == REQUESTED_V2) {
                u = abi.decode(logs[i].data, (bytes32));
            }
        }
    }

    /// A challenge by a real cat owner, accepted by a real Sahur owner; returns the ids and the user contribution.
    function _fight(uint256 stake) internal returns (uint256 id, uint64 seq, address a, address b, bytes32 u) {
        uint256 catId;
        uint256 sahurId;
        (catId, a) = _owner(CATS, 1, address(0), address(0));
        (sahurId, b) = _owner(SAHURS, 1, a, address(0));
        vm.deal(a, a.balance + 2_000 ether);
        vm.deal(b, b.balance + 2_000 ether);
        vm.prank(a);
        id = club.challenge{value: stake}(CATS, catId, address(0));
        uint256 fee = club.quote();
        vm.recordLogs();
        vm.prank(b);
        seq = club.accept{value: stake + fee}(id, SAHURS, sahurId);
        u = _userContribution(vm.getRecordedLogs());
    }

    // ---------------------------------------------------------------- 1. the fee is not "a little more" if the default drops
    /// The README says a lower provider default would make a 1M request cost "a little more than the minimum". On the
    /// real fee formula (Entropy.getProviderFee: feeInWei * roundedGasLimit / defaultGasLimit) it is linear: the real
    /// provider setting its default to 100k makes quote() 4.6 MON, 10k makes it 41 MON. accept() pays whatever quote()
    /// says, and the site sends stake + quote(). Nothing is stolen (the fee goes to Pyth and the provider), but a
    /// provider config change turns a 1.4 MON fee into a 41 MON one with no cap in the contract.
    function test_audit_feeScalesLinearlyWhenProviderLowersDefault() public {
        if (block.chainid != 143) return;
        assertEq(club.quote(), 1.4 ether, "today: 0.4 provider + 1 Pyth");

        vm.prank(PROVIDER);
        ENTROPY.setDefaultGasLimit(100_000);
        assertEq(club.quote(), 5 ether, "default 100k: 0.4 + 0.4 * 9 + 1");

        vm.prank(PROVIDER);
        ENTROPY.setDefaultGasLimit(10_000);
        assertEq(club.quote(), 41 ether, "default 10k: 0.4 + 0.4 * 99 + 1");

        // and accept charges it in full
        (uint256 id, uint64 seq, address a, address b,) = _fight(1 ether);
        assertEq(club.fight(id).acceptor, b);
        IEntropyA.Request memory r = ENTROPY.getRequestV2(PROVIDER, seq);
        assertEq(r.gasLimit10k, 100, "still a 1M callback");
        a; // silence
    }

    // ---------------------------------------------------------------- 2. LastRevealedTooOld blocks accept
    /// The real provider's maxNumHashes is 300: once 300 requests are waiting on it unrevealed (the keeper down, or
    /// 300 x 1.4 MON of spam in one block), every further requestV2 reverts LastRevealedTooOld, and with it accept().
    /// Liveness only: nothing is locked (the challenge stays open and cancellable), and it clears with the next reveal.
    function test_audit_lastRevealedTooOldBlocksAccept() public {
        if (block.chainid != 143) return;
        IEntropyA.ProviderInfo memory p = ENTROPY.getProviderInfoV2(PROVIDER);
        assertEq(p.maxNumHashes, 300);
        address spammer = makeAddr("spammer");
        vm.deal(spammer, 1_000 ether);
        uint256 n;
        // fill the provider's window: requests until the next one would need 301 hashes (numHashes > maxNumHashes)
        while (p.sequenceNumber - p.currentCommitmentSequenceNumber <= 300) {
            vm.prank(spammer);
            ENTROPY.requestV2{value: 1.4 ether}(PROVIDER, 0);
            p = ENTROPY.getProviderInfoV2(PROVIDER);
            n++;
        }
        console.log("spam requests needed", n, "MON spent", n * 1.4 ether / 1 ether);
        (uint256 catId, address a) = _owner(CATS, 1, address(0), address(0));
        (uint256 sahurId, address b) = _owner(SAHURS, 1, a, address(0));
        vm.deal(a, a.balance + 100 ether);
        vm.deal(b, b.balance + 100 ether);
        vm.prank(a);
        uint256 id = club.challenge{value: 2 ether}(CATS, catId, address(0));
        uint256 fee = club.quote();
        vm.prank(b);
        vm.expectRevert(abi.encodeWithSelector(LAST_REVEALED_TOO_OLD));
        club.accept{value: 2 ether + fee}(id, SAHURS, sahurId);
        // the challenge is untouched and the challenger can still take it back
        assertEq(uint8(club.fight(id).status), uint8(FightClub.Status.Open));
        vm.prank(a);
        club.cancel(id);
    }

    // ---------------------------------------------------------------- 3. a provider rotation does not strand a request
    /// register() again rotates the commitment and keeps the sequence counter monotonic; an in-flight request keeps
    /// its own commitment and numHashes, so the OLD chain's value still reveals it afterwards and the fight settles.
    function test_audit_providerRotationKeepsRequestRevealable() public {
        if (block.chainid != 143) return;
        _forkProvider(20);
        (uint256 id, uint64 seq, address a, address b, bytes32 u) = _fight(3 ether);
        assertEq(seq, 1);
        bytes32 oldValue = chain[seq];

        // the provider rotates to a brand-new chain
        bytes32[] memory fresh = new bytes32[](6);
        fresh[5] = keccak256("second chain");
        for (uint256 i = 5; i > 0; i--) {
            fresh[i - 1] = keccak256(bytes.concat(fresh[i]));
        }
        vm.prank(prov);
        ENTROPY.register(0.4 ether, fresh[0], "", 6, "");
        IEntropyA.ProviderInfo memory p = ENTROPY.getProviderInfoV2(prov);
        assertEq(p.sequenceNumber, 3, "the counter never restarts: 2 was taken by the rotation itself");
        assertEq(p.currentCommitment, fresh[0]);

        // the old request is still answerable with the old chain
        ENTROPY.revealWithCallback{gas: 2_000_000}(prov, seq, u, oldValue);
        assertEq(uint8(club.fight(id).status), uint8(FightClub.Status.Fought));
        address winner = club.fight(id).winner;
        assertTrue(winner == a || winner == b);

        // and the next accept is keyed on a fresh sequence number, no SequenceReused
        (uint256 id2, uint64 seq2,,,) = _fight(1 ether);
        assertEq(seq2, 3);
        assertEq(club.fightOfRequest(prov, seq2), id2);
    }

    // ---------------------------------------------------------------- 4. a late reveal after abort, through the real code
    /// After abort(), the keeper's reveal runs the callback with 1M gas, it reverts NotPending, Pyth marks the request
    /// CALLBACK_FAILED (3) and keeps it; the recovery path (a second reveal) clears it first and calls without a
    /// catch, so it reverts whole and the request stays FAILED for ever. Fight Club's books never move.
    function test_audit_lateRevealAfterAbortIsFailedAndStuckInPyth() public {
        if (block.chainid != 143) return;
        _forkProvider(20);
        (uint256 id, uint64 seq, address a, address b, bytes32 u) = _fight(5 ether);
        vm.warp(block.timestamp + 24 hours);
        club.abort(id);
        assertEq(uint8(club.fight(id).status), uint8(FightClub.Status.Aborted));
        uint256 bal = address(club).balance;
        uint256 acc = club.accounted();

        ENTROPY.revealWithCallback{gas: 2_000_000}(prov, seq, u, chain[seq]);
        IEntropyA.Request memory r = ENTROPY.getRequestV2(prov, seq);
        assertEq(r.callbackStatus, 3, "CALLBACK_FAILED");
        assertEq(r.sequenceNumber, seq, "still active in Pyth's table");
        assertEq(uint8(club.fight(id).status), uint8(FightClub.Status.Aborted));
        assertEq(address(club).balance, bal);
        assertEq(club.accounted(), acc);

        // the recovery path reverts whole with our reason
        vm.expectRevert(abi.encodeWithSelector(FightClub.NotPending.selector, id));
        ENTROPY.revealWithCallback{gas: 2_000_000}(prov, seq, u, chain[seq]);
        r = ENTROPY.getRequestV2(prov, seq);
        assertEq(r.callbackStatus, 3);
        a;
        b;
    }

    // ---------------------------------------------------------------- 5. a request evicted into Pyth's overflow map
    /// Entropy keeps 32 array slots keyed by keccak(provider, seq)[0] & 0x1f; a later request with the same short key
    /// evicts ours into the overflow mapping. The reveal must still find it and settle the fight.
    function test_audit_revealFromEvictedOverflowSlot() public {
        if (block.chainid != 143) return;
        _forkProvider(200);
        (uint256 id, uint64 seq, address a, address b, bytes32 u) = _fight(2 ether);
        uint8 mine = uint8(keccak256(abi.encodePacked(prov, seq))[0] & 0x1f);
        address other = makeAddr("other");
        vm.deal(other, 1_000 ether);
        uint64 next = seq;
        bool evicted;
        for (uint256 i = 0; i < 150 && !evicted; i++) {
            vm.prank(other);
            next = ENTROPY.requestV2{value: 1.4 ether}(prov, 0);
            if (uint8(keccak256(abi.encodePacked(prov, next))[0] & 0x1f) == mine) evicted = true;
        }
        assertTrue(evicted, "found a colliding sequence");
        IEntropyA.Request memory r = ENTROPY.getRequestV2(prov, seq);
        assertEq(r.requester, address(club), "still readable from the overflow map");
        ENTROPY.revealWithCallback{gas: 2_000_000}(prov, seq, u, chain[seq]);
        assertEq(uint8(club.fight(id).status), uint8(FightClub.Status.Fought));
        address w = club.fight(id).winner;
        assertTrue(w == a || w == b);
    }

    // ---------------------------------------------------------------- 6. the acceptor can steer the user contribution
    /// requestV2(provider, gasLimit) takes no user number: Entropy's in-contract PRNG (keccak of timestamp, prevrandao,
    /// msg.sender and a rolling seed) supplies it, and anyone can roll that seed with a request of their own in the same
    /// transaction. So the acceptor picks among user contributions at 1.4 MON a roll. Without the provider's secret that
    /// buys nothing (the outcome is keccak(user, provider) and the provider part is committed); with a colluding provider
    /// it is a guaranteed win for ~2.8 MON expected. Pyth documents the collusion caveat; recorded here as measured.
    function test_audit_acceptorCanRerollUserContribution() public {
        if (block.chainid != 143) return;
        (uint256 catId, address a) = _owner(CATS, 1, address(0), address(0));
        (uint256 sahurId, address b) = _owner(SAHURS, 1, a, address(0));
        vm.deal(a, a.balance + 100 ether);
        vm.deal(b, b.balance + 100 ether);
        vm.prank(a);
        uint256 id = club.challenge{value: 2 ether}(CATS, catId, address(0));
        uint256 fee = club.quote();

        uint256 snap = vm.snapshotState();
        vm.recordLogs();
        vm.prank(b);
        club.accept{value: 2 ether + fee}(id, SAHURS, sahurId);
        bytes32 u1 = _userContribution(vm.getRecordedLogs());
        vm.revertToState(snap);

        // same block, same state, but the acceptor rolls the seed first
        vm.startPrank(b);
        ENTROPY.requestV2{value: 1.4 ether}();
        vm.recordLogs();
        club.accept{value: 2 ether + fee}(id, SAHURS, sahurId);
        vm.stopPrank();
        bytes32 u2 = _userContribution(vm.getRecordedLogs());
        assertTrue(u1 != u2, "the user contribution of the fight changed with a 1.4 MON roll");
    }
}
