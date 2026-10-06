// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Test, console} from "forge-std/Test.sol";
import {Vm} from "forge-std/Vm.sol";
import {FightClub} from "../src/fightclub/FightClub.sol";
import {MockEntropy} from "./mocks/MockEntropy.sol";
import {MockPets} from "./mocks/FightMocks.sol";
import {DeployFightClub} from "../script/DeployFightClub.s.sol";

interface IOwnerOfM {
    function ownerOf(uint256 id) external view returns (address);
    function transferFrom(address from, address to, uint256 id) external;
}

interface ICrownM {
    function crownList() external view returns (uint256[] memory, uint256[] memory, uint256[] memory, bool[] memory);
    function totalSupply() external view returns (uint256);
}

interface ISafeFactory {
    function createProxyWithNonce(address singleton, bytes memory initializer, uint256 saltNonce)
        external
        returns (address proxy);
}

interface ISafe {
    function setup(
        address[] calldata owners,
        uint256 threshold,
        address to,
        bytes calldata data,
        address fallbackHandler,
        address paymentToken,
        uint256 payment,
        address payable paymentReceiver
    ) external;
}

/// The wallet kinds Fight Club pays on Monad, on a fork of mainnet with real pets and real owners: a MetaMask
/// EIP-7702 account (the team's own kind), a Safe 1.4.1 made by the real factory, and a plain EOA. Run:
///   forge test --match-contract FightClubMonadFork --fork-url https://rpc.monad.xyz -vv
///   (and, with Foundry >= 1.8, add `--network monad` for Monad's gas schedule and transaction rules)
contract FightClubMonadForkTest is Test {
    address constant ENTROPY = 0xD458261E832415CFd3BAE5E416FdF3230ce6F134;
    address constant TEAM = 0xB7EEE0445afc7651025b06974F3BdeEdf8840439;
    address constant CATS = 0xC0A0808cbAF507b80df92b22feD8D3810eAB45d5;
    address constant FROKS = 0xB841cc9A4058345cc0B5913F9e966F0C06ab49c6;
    address constant SAHURS = 0xc7969C5df0353e4E65B54e3587bD0CaB5d1aF4c7;
    address constant DELEGATOR = 0x63c0c19a282a1B52b07dD5a65b58948A07DAE32B; // MetaMask EIP7702StatelessDeleGator 1.3.0
    address constant SAFE_SINGLETON = 0x41675C099F32341bf84BFc5382aF534df5C7461a; // Safe 1.4.1
    address constant SAFE_FACTORY = 0x4e1DCf7AD4e460CfD30791CCC4F9c8a4f820ec67; // SafeProxyFactory 1.4.1
    bytes32 constant PAID = keccak256("Paid(uint256,address,uint256)");
    bytes32 constant CREDITED = keccak256("Credited(uint256,address,uint256)");
    bytes32 constant SAFE_RECEIVED = keccak256("SafeReceived(address,uint256)");

    FightClub club;

    function setUp() public {
        if (block.chainid != 143) return;
        club = new FightClub(ENTROPY, TEAM, CATS, FROKS, SAHURS);
    }

    // ---------------------------------------------------------------- real owners (as FightClubFork.t.sol)
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

    function _plain(address o, address avoid1, address avoid2) internal view returns (bool) {
        return o != address(0) && o.code.length == 0 && !_anvil(o) && o != avoid1 && o != avoid2 && o != TEAM;
    }

    function _owner(address col, uint256 start, address avoid1, address avoid2)
        internal
        view
        returns (uint256 id, address who)
    {
        (uint256[] memory ids,,, bool[] memory alive) = ICrownM(col).crownList();
        for (uint256 i = start - 1; i < ids.length; i++) {
            if (!alive[i]) continue;
            id = ids[i];
            try IOwnerOfM(col).ownerOf(id) returns (address o) {
                if (_plain(o, avoid1, avoid2)) return (id, o);
            } catch {}
        }
        uint256 total = ICrownM(col).totalSupply();
        uint256 skip = start - 1;
        for (id = total; id > 0 && id + 300 > total; id--) {
            if (!_isAlive(col, id)) continue;
            try IOwnerOfM(col).ownerOf(id) returns (address o) {
                if (!_plain(o, avoid1, avoid2)) continue;
                if (skip > 0) {
                    skip--;
                    continue;
                }
                return (id, o);
            } catch {}
        }
        revert("no plain owner of a living pet found");
    }

    /// Does THIS EVM resolve an EIP-7702 designator (0xef0100 + delegate) to the delegate's code? Asked of the real
    /// team wallet: its delegate answers NAME() with its own name. forge < 1.8 on cancun does not; Monad does.
    function _delegateRuns() internal view returns (bool) {
        (bool ok, bytes memory ret) = TEAM.staticcall(abi.encodeWithSignature("NAME()"));
        if (!ok || ret.length < 96) return false;
        return keccak256(bytes(abi.decode(ret, (string)))) == keccak256("EIP7702StatelessDeleGator");
    }

    function _find(Vm.Log[] memory logs, bytes32 topic) internal view returns (bool seen, uint256 amount) {
        for (uint256 i = 0; i < logs.length; i++) {
            if (logs[i].emitter == address(club) && logs[i].topics[0] == topic) {
                return (true, abi.decode(logs[i].data, (uint256)));
            }
        }
    }

    function _delegate(address who) internal {
        vm.etch(who, abi.encodePacked(hex"ef0100", DELEGATOR));
        assertEq(who.code.length, 23);
    }

    // ---------------------------------------------------------------- 1. this EVM and 7702 accounts
    function test_fork_evmAnd7702Delegate() public {
        if (block.chainid != 143) return;
        assertEq(TEAM.code.length, 23, "TEAM is an EIP-7702 account");
        assertEq(bytes3(TEAM.code), bytes3(hex"ef0100"));
        bool runs = _delegateRuns();
        console.log("this EVM runs the MetaMask delegate behind TEAM:", runs);
        // a plain push with PUSH_GAS, as the callback does it
        address from = makeAddr("pusher");
        vm.deal(from, 1 ether);
        vm.prank(from);
        uint256 g = gasleft();
        (bool ok,) = TEAM.call{value: 1, gas: 50_000}("");
        g = g - gasleft();
        assertTrue(ok, "TEAM takes a 1 wei push with 50k gas");
        console.log("gas of the whole push frame (caller side, this schedule)", g);
    }

    // ---------------------------------------------------------------- 2. a MetaMask 7702 winner at MAX_STAKE
    function test_fork_winnerIs7702MetaMask_maxStake_pushLands() public {
        if (block.chainid != 143) return;
        (uint256 catId, address a) = _owner(CATS, 1, address(0), address(0));
        (uint256 sahurId, address b) = _owner(SAHURS, 1, a, address(0));
        _delegate(b); // b becomes exactly what the team wallet is: a MetaMask 7702 account
        vm.deal(a, a.balance + 2_000 ether);
        vm.deal(b, b.balance + 2_000 ether);
        vm.prank(a);
        uint256 id = club.challenge{value: 1_000 ether}(CATS, catId, address(0));
        uint256 fee = club.quote();
        vm.prank(b);
        uint64 seq = club.accept{value: 1_000 ether + fee}(id, SAHURS, sahurId);

        bool runs = _delegateRuns();
        address provider = ENTROPY_PROVIDER();
        uint256 bBefore = b.balance;
        vm.recordLogs();
        vm.prank(ENTROPY);
        uint256 g = gasleft();
        club._entropyCallback{gas: 1_000_000}(seq, provider, bytes32(uint256(1))); // odd: the acceptor wins
        g = g - gasleft();
        console.log("callback gas, winner a MetaMask 7702 account (this schedule)", g);
        (bool paid, uint256 amount) = _find(vm.getRecordedLogs(), PAID);
        console.log("delegate resolved by this EVM:", runs, "| Paid:", paid);
        if (runs) {
            assertTrue(paid, "a 7702 winner is PAID, not credited");
            assertEq(amount, 1_900 ether);
            assertEq(b.balance - bBefore, 1_900 ether);
            assertEq(club.owed(b), 0);
        } else {
            // forge without Monad execution: the designator is not resolved; the outcome here says nothing
            // about mainnet. The real node measured this push at ~212 gas of callee work (cast estimate to TEAM).
            assertEq(b.balance - bBefore + club.owed(b), 1_900 ether, "wealth is right either way");
        }
        assertEq(club.teamOwed(), 100 ether);
        // and the team's cut reaches the real 7702 team wallet
        uint256 t0 = TEAM.balance;
        club.sweep();
        assertEq(TEAM.balance - t0, 100 ether);
    }

    function ENTROPY_PROVIDER() internal view returns (address p) {
        (, bytes memory ret) = ENTROPY.staticcall(abi.encodeWithSignature("getDefaultProvider()"));
        p = abi.decode(ret, (address));
    }

    // ---------------------------------------------------------------- 3. a Safe winner (real Safe 1.4.1 on Monad)
    function test_fork_winnerIsASafe_pushLands() public {
        if (block.chainid != 143) return;
        assertGt(SAFE_SINGLETON.code.length, 0, "Safe 1.4.1 is on Monad");
        assertGt(SAFE_FACTORY.code.length, 0, "SafeProxyFactory 1.4.1 is on Monad");
        address[] memory owners = new address[](1);
        owners[0] = makeAddr("safe-owner");
        bytes memory init = abi.encodeCall(
            ISafe.setup, (owners, 1, address(0), "", address(0), address(0), 0, payable(address(0)))
        );
        address safe = ISafeFactory(SAFE_FACTORY).createProxyWithNonce(SAFE_SINGLETON, init, 7);
        console.log("safe", safe);
        console.log("SAFEPROXYCODE", vm.toString(safe.code));

        // a real living frok moves into the Safe (plain transferFrom: no receiver hook needed)
        (uint256 frokId, address a) = _owner(FROKS, 1, address(0), address(0));
        vm.prank(a);
        IOwnerOfM(FROKS).transferFrom(a, safe, frokId);
        assertEq(IOwnerOfM(FROKS).ownerOf(frokId), safe);
        (uint256 catId, address b) = _owner(CATS, 1, a, safe);
        vm.deal(safe, 100 ether);
        vm.deal(b, b.balance + 100 ether);

        vm.prank(safe);
        uint256 id = club.challenge{value: 10 ether}(FROKS, frokId, address(0));
        uint256 fee = club.quote();
        vm.prank(b);
        uint64 seq = club.accept{value: 10 ether + fee}(id, CATS, catId);

        address provider = ENTROPY_PROVIDER();
        uint256 sBefore = safe.balance;
        vm.recordLogs();
        vm.prank(ENTROPY);
        uint256 g = gasleft();
        club._entropyCallback{gas: 1_000_000}(seq, provider, bytes32(uint256(42))); // even: the Safe wins
        g = g - gasleft();
        console.log("callback gas, winner a Safe 1.4.1 (this schedule)", g);
        Vm.Log[] memory logs = vm.getRecordedLogs();
        (bool paid, uint256 amount) = _find(logs, PAID);
        assertTrue(paid, "the Safe is PAID within PUSH_GAS");
        assertEq(amount, 19 ether);
        assertEq(safe.balance - sBefore, 19 ether);
        bool received;
        for (uint256 i = 0; i < logs.length; i++) {
            if (logs[i].emitter == safe && logs[i].topics[0] == SAFE_RECEIVED) received = true;
        }
        assertTrue(received, "the Safe's receive() ran and emitted SafeReceived");
        assertEq(club.owed(safe), 0);
    }

    // ---------------------------------------------------------------- 4. a 7702 wallet takes what it is owed
    function test_fork_withdrawBy7702Wallet() public {
        if (block.chainid != 143) return;
        address w = makeAddr("owed-7702");
        _delegate(w);
        // it is owed 3 MON (as if a push to it had failed): owed[w] (slot 8) and totalOwed (slot 10, low 128 bits)
        bytes32 slot = keccak256(abi.encode(w, uint256(8)));
        vm.store(address(club), slot, bytes32(uint256(3 ether)));
        vm.store(address(club), bytes32(uint256(10)), bytes32(uint256(3 ether)));
        vm.deal(address(club), 3 ether);
        assertEq(club.owed(w), 3 ether);
        assertEq(club.accounted(), 3 ether);
        bool runs = _delegateRuns();

        uint256 before = w.balance;
        vm.prank(w);
        club.withdraw();
        assertEq(w.balance - before, 3 ether, "a 7702 wallet withdraws to itself");
        assertEq(club.owed(w), 0);
        assertEq(club.totalOwed(), 0);
        console.log("delegate resolved by this EVM:", runs);

        // and withdrawTo another address
        vm.store(address(club), slot, bytes32(uint256(1 ether)));
        vm.store(address(club), bytes32(uint256(10)), bytes32(uint256(1 ether)));
        vm.deal(address(club), 1 ether);
        address other = makeAddr("other");
        vm.prank(w);
        club.withdrawTo(other);
        assertEq(other.balance, 1 ether);
        assertEq(club.accounted(), 0);
    }

    // ---------------------------------------------------------------- 5. the reserve rule, as this EVM sees it
    /// On Monad a 7702-delegated challenger whose balance would end below 10 MON REVERTS at execution (docs:
    /// "transactions that would reduce its balance to below 10 MON will unconditionally revert"). forge < 1.8 and
    /// anvil without `--network monad` do not model it. This test only reports what the EVM in use does.
    function test_fork_reserveRule_7702ChallengerBelowTenMon() public {
        if (block.chainid != 143) return;
        (uint256 catId, address a) = _owner(CATS, 1, address(0), address(0));
        _delegate(a);
        vm.deal(a, 10.5 ether); // a 1 MON stake would leave 9.5 MON: below the reserve
        vm.prank(a);
        try club.challenge{value: 1 ether}(CATS, catId, address(0)) returns (uint256 id) {
            console.log("this EVM let a 7702 account stake below its 10 MON reserve (mainnet would revert); id", id);
            vm.prank(a);
            club.cancel(id);
        } catch {
            console.log("this EVM enforced the 10 MON reserve on the 7702 challenger (as mainnet does)");
        }
        // with 11 MON it must always work: 10 MON stays
        vm.deal(a, 11 ether);
        vm.prank(a);
        club.challenge{value: 1 ether}(CATS, catId, address(0));
        assertEq(a.balance, 10 ether);
    }
}

/// A Pyth look-alike for the deploy script's probes (answers getAdmin, which MockEntropy does not).
contract FakePyth {
    address public admin = 0x26DD80569a8B23768A1d80869Ed7339e07595E85;

    function getAdmin() external view returns (address) {
        return admin;
    }

    function getDefaultProvider() external pure virtual returns (address) {
        return 0x52DeaA1c84233F7bb8C8A45baeDE41091c616506;
    }

    function getFeeV2(address, uint32) external pure returns (uint128) {
        return 1.4 ether;
    }

    function requestV2(address, uint32) external payable returns (uint64) {
        return 1;
    }
}

contract NamedPets is MockPets {
    string private _n;
    string private _s;

    constructor(string memory n, string memory s) {
        _n = n;
        _s = s;
    }

    function name() external view returns (string memory) {
        return _n;
    }

    function symbol() external view returns (string memory) {
        return _s;
    }
}

/// The deploy script's refusals and its read-back, driven directly (the env is process-wide and forge runs tests in
/// parallel, so only the one mainnet-override test uses it).
contract FightClubDeployScriptTest is Test {
    DeployFightClub script;
    FakePyth pyth;
    NamedPets cat;
    NamedPets frok;
    NamedPets sahur;
    address team = makeAddr("team");

    function setUp() public {
        script = new DeployFightClub();
        pyth = new FakePyth();
        cat = new NamedPets("Emogotchi", "EMOGOTCHI");
        frok = new NamedPets("Inversegotchi", "INVERSEBRAH");
        sahur = new NamedPets("Tung Tung Tung Sahuragotchi", "TUNG");
        cat.mint(address(1));
        frok.mint(address(1));
        sahur.mint(address(1));
    }

    function test_script_preflightPassesAndReadsBack() public {
        script.preflight(address(pyth), team, address(cat), address(frok), address(sahur), false);
        FightClub club = new FightClub(address(pyth), team, address(cat), address(frok), address(sahur));
        script.readBack(club, address(pyth), team, address(cat), address(frok), address(sahur));
        // and the read-back catches a wrong deployment
        FightClub wrong = new FightClub(address(pyth), address(2), address(cat), address(frok), address(sahur));
        vm.expectRevert(bytes("read-back TEAM"));
        script.readBack(wrong, address(pyth), team, address(cat), address(frok), address(sahur));
    }

    function test_script_refusesMockEntropy() public {
        MockEntropy mock = new MockEntropy();
        vm.expectRevert(bytes("ENTROPY is not Pyth Entropy (a mock?)"));
        script.preflight(address(mock), team, address(cat), address(frok), address(sahur), false);
    }

    function test_script_refusesAPetWithNoName() public {
        MockPets bare = new MockPets();
        vm.expectRevert();
        script.preflight(address(pyth), team, address(bare), address(frok), address(sahur), false);
    }

    function test_script_refusesPetsInTheWrongOrder() public {
        vm.expectRevert(bytes("EMOGOTCHI: name() is not Emogotchi"));
        script.preflight(address(pyth), team, address(frok), address(cat), address(sahur), false);
    }

    function test_script_refusesAnEoaAsEntropy() public {
        vm.expectRevert(bytes("ENTROPY has no code"));
        script.preflight(makeAddr("nobody"), team, address(cat), address(frok), address(sahur), false);
    }

    function test_script_refusesATeamContract() public {
        vm.expectRevert(bytes("TEAM is a contract"));
        script.preflight(address(pyth), address(cat), address(cat), address(frok), address(sahur), false);
    }

    function test_script_acceptsA7702Team() public {
        address t = makeAddr("team-7702");
        vm.etch(t, abi.encodePacked(hex"ef0100", address(0x63c0c19a282a1B52b07dD5a65b58948A07DAE32B)));
        script.preflight(address(pyth), t, address(cat), address(frok), address(sahur), false);
    }

    function test_script_onMainnetTheProviderMustBePyths() public {
        // a Pyth look-alike with another default provider is refused on mainnet, accepted elsewhere
        OtherProviderPyth other = new OtherProviderPyth();
        script.preflight(address(other), team, address(cat), address(frok), address(sahur), false);
        vm.expectRevert(bytes("ENTROPY default provider is not the known one"));
        script.preflight(address(other), team, address(cat), address(frok), address(sahur), true);
    }

    function test_script_onMainnetRefusesEnvOverrides() public {
        vm.chainId(143);
        vm.setEnv("ENTROPY", vm.toString(address(pyth)));
        vm.expectRevert(bytes("ENTROPY override refused on mainnet"));
        script.run();
    }
}

contract OtherProviderPyth is FakePyth {
    function getDefaultProvider() external pure override returns (address) {
        return address(0xB0B);
    }
}

/// The lobby's paging, cold, at a size a busy day could reach: eth_call on the public RPC is capped at 200M (docs) and
/// the low-gas pool at 8.1M; the site pages at 60. Under `--network monad` these are Monad's numbers.
contract FightClubPagingGasTest is Test {
    MockEntropy entropy;
    MockPets cats;
    MockPets froks;
    MockPets sahurs;
    FightClub club;
    address alice = makeAddr("alice");

    function setUp() public {
        vm.warp(1_790_000_000);
        entropy = new MockEntropy();
        cats = new MockPets();
        froks = new MockPets();
        sahurs = new MockPets();
        club = new FightClub(address(entropy), makeAddr("team"), address(cats), address(froks), address(sahurs));
        vm.deal(alice, 100_000 ether);
        for (uint256 i = 0; i < 300; i++) {
            uint256 id = cats.mint(alice);
            vm.prank(alice);
            club.challenge{value: 1 ether}(address(cats), id, address(0));
        }
        assertEq(club.openCount(), 300);
    }

    function test_openChallengesPagingGas() public {
        uint256[3] memory sizes = [uint256(60), 100, 300];
        for (uint256 i = 0; i < 3; i++) {
            vm.cool(address(club));
            uint256 g = gasleft();
            FightClub.FightView[] memory page = club.openChallenges(0, sizes[i]);
            g = g - gasleft();
            assertEq(page.length, sizes[i]);
            console.log("openChallenges(0, n) cold, n =", sizes[i], "gas", g);
            assertLt(g, 8_100_000, "fits the public RPC's low-gas eth_call pool");
        }
        vm.cool(address(club));
        uint256 g2 = gasleft();
        club.fightsOf(alice, 0, 300);
        g2 = g2 - gasleft();
        console.log("fightsOf(alice, 0, 300) cold gas", g2);
        // and the 300th cancel (swap-remove from the front) stays cheap
        vm.cool(address(club));
        uint256 g3 = gasleft();
        vm.prank(alice);
        club.cancel(1);
        g3 = g3 - gasleft();
        console.log("cancel(1) with 300 open, cold, gas", g3);
        assertEq(club.openCount(), 299);
    }
}
