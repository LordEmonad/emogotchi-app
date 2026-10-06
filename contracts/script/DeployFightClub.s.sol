// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script, console} from "forge-std/Script.sol";
import {FightClub} from "../src/fightclub/FightClub.sol";
import {IEntropyV2} from "../src/fightclub/IEntropyV2.sol";

interface IPetMeta {
    function name() external view returns (string memory);
    function symbol() external view returns (string memory);
}

/// Fight Club on mainnet (Monad, chain id 143). One transaction: `new FightClub(entropy, team, cat, frok, sahur)`.
///
///   ~/.foundry/bin/forge script script/DeployFightClub.s.sol --rpc-url https://rpc.monad.xyz --broadcast --slow \
///     --verify --verifier sourcify --account emogotchi --sender 0x40aD8cF176672Efe12a0D7AC50fa5da2b0b64e74 \
///     --gas-estimate-multiplier 130
///
/// Dry-run first (the same command without --broadcast). On chain id 143 every address is a constant below and an
/// env override is REFUSED, so a MockEntropy, a mock pet or a stale team wallet cannot be deployed by accident. On
/// any other chain (a testnet, a local anvil that is NOT a mainnet fork) the five addresses come from the env
/// (ENTROPY, TEAM, CAT, FROK, SAHUR) and go through the same probes.
///
/// Probes before the deploy: Entropy has code, is a Pyth Entropy (answers `getAdmin()`, which MockEntropy does not),
/// its default provider is the known one on mainnet and its fee for CALLBACK_GAS is sane; each pet contract has code,
/// its `name()`/`symbol()` are Emogotchi's, and `state(1)` answers a View struct; TEAM has no code or is an
/// EIP-7702 account (code `0xef0100…`, 23 bytes: the team's MetaMask wallet). After the deploy every immutable and
/// constant is read back and compared, and `quote()` is checked against Entropy's own fee.
///
/// Monad charges the gas LIMIT: the deploy is one CREATE of ~11 KB of runtime code, about 2.4M gas on the node
/// (forge's estimate reads low for cold state on Monad, hence the multiplier). Keep ~1 MON in the deployer.
contract DeployFightClub is Script {
    address constant ENTROPY = 0xD458261E832415CFd3BAE5E416FdF3230ce6F134; // Pyth Entropy v2 (proxy)
    address constant PROVIDER = 0x52DeaA1c84233F7bb8C8A45baeDE41091c616506; // Pyth's default provider on Monad
    address constant TEAM = 0xB7EEE0445afc7651025b06974F3BdeEdf8840439;
    address constant CAT = 0xC0A0808cbAF507b80df92b22feD8D3810eAB45d5;
    address constant FROK = 0xB841cc9A4058345cc0B5913F9e966F0C06ab49c6;
    address constant SAHUR = 0xc7969C5df0353e4E65B54e3587bD0CaB5d1aF4c7;
    uint32 constant CALLBACK_GAS = 1_000_000;

    function run() external returns (FightClub club) {
        bool mainnet = block.chainid == 143;
        (address entropy, address team, address cat, address frok, address sahur) = _addresses(mainnet);

        preflight(entropy, team, cat, frok, sahur, mainnet);

        vm.startBroadcast();
        club = new FightClub(entropy, team, cat, frok, sahur);
        vm.stopBroadcast();

        readBack(club, entropy, team, cat, frok, sahur);

        console.log("FIGHTCLUB", address(club));
        console.log("ENTROPY", entropy);
        console.log("TEAM", team);
        console.log("CAT", cat);
        console.log("FROK", frok);
        console.log("SAHUR", sahur);
        console.log("quote (wei)", club.quote());
        console.log("runtime code bytes", address(club).code.length);
        console.log("BLOCK", block.number);
        console.log("constructor args (for a manual sourcify verify):");
        console.logBytes(abi.encode(entropy, team, cat, frok, sahur));
    }

    function _addresses(bool mainnet)
        internal
        view
        returns (address entropy, address team, address cat, address frok, address sahur)
    {
        if (mainnet) {
            // an env override on mainnet is a mistake, not a choice
            require(vm.envOr("ENTROPY", ENTROPY) == ENTROPY, "ENTROPY override refused on mainnet");
            require(vm.envOr("TEAM", TEAM) == TEAM, "TEAM override refused on mainnet");
            require(vm.envOr("CAT", CAT) == CAT, "CAT override refused on mainnet");
            require(vm.envOr("FROK", FROK) == FROK, "FROK override refused on mainnet");
            require(vm.envOr("SAHUR", SAHUR) == SAHUR, "SAHUR override refused on mainnet");
            return (ENTROPY, TEAM, CAT, FROK, SAHUR);
        }
        return (
            vm.envAddress("ENTROPY"), vm.envAddress("TEAM"), vm.envAddress("CAT"), vm.envAddress("FROK"), vm.envAddress("SAHUR")
        );
    }

    /// Every check that runs before the deploy transaction (public so a test can drive it without the env).
    function preflight(address entropy, address team, address cat, address frok, address sahur, bool mainnet)
        public
        view
    {
        _checkEntropy(entropy, mainnet);
        _checkPet(cat, "Emogotchi", "EMOGOTCHI");
        _checkPet(frok, "Inversegotchi", "INVERSEBRAH");
        _checkPet(sahur, "Tung Tung Tung Sahuragotchi", "TUNG");
        _checkTeam(team);
    }

    function _checkEntropy(address entropy, bool mainnet) internal view {
        require(entropy.code.length > 0, "ENTROPY has no code");
        // Pyth's Entropy answers getAdmin(); a MockEntropy (or any other contract) does not
        (bool ok, bytes memory ret) = entropy.staticcall(abi.encodeWithSignature("getAdmin()"));
        require(ok && ret.length == 32 && abi.decode(ret, (address)) != address(0), "ENTROPY is not Pyth Entropy (a mock?)");
        address provider = IEntropyV2(entropy).getDefaultProvider();
        require(provider != address(0), "ENTROPY has no default provider");
        if (mainnet) require(provider == PROVIDER, "ENTROPY default provider is not the known one");
        uint256 fee = IEntropyV2(entropy).getFeeV2(provider, CALLBACK_GAS);
        require(fee > 0 && fee < 10 ether, "ENTROPY fee out of the expected range");
        console.log("Entropy provider", provider);
        console.log("Entropy fee for 1M callback gas (wei)", fee);
    }

    function _checkPet(address pet, string memory name, string memory symbol) internal view {
        require(pet.code.length > 0, string.concat(symbol, ": no code"));
        require(_eq(IPetMeta(pet).name(), name), string.concat(symbol, ": name() is not ", name));
        require(_eq(IPetMeta(pet).symbol(), symbol), string.concat(symbol, ": symbol() mismatch"));
        // the View struct Fight Club reads: id, owner, name, started, alive (>= 6 words after the offset)
        (bool ok, bytes memory ret) = pet.staticcall(abi.encodeWithSignature("state(uint256)", 1));
        require(ok && ret.length >= 224, string.concat(symbol, ": state(1) does not answer a View"));
        require(abi.decode(ret, (uint256)) == 32, string.concat(symbol, ": state(1) is not a struct"));
    }

    function _checkTeam(address team) internal view {
        require(team != address(0), "TEAM zero");
        bytes memory code = team.code;
        if (code.length != 0) {
            // an EIP-7702 account: 0xef0100 + 20 bytes. Anything else is a contract we did not plan for.
            require(code.length == 23 && code[0] == 0xef && code[1] == 0x01 && code[2] == 0x00, "TEAM is a contract");
            console.log("TEAM is an EIP-7702 account (its delegate takes plain MON; fork-tested)");
        }
    }

    /// Every immutable and constant read back off the deployed contract and compared (public for the tests).
    function readBack(FightClub club, address entropy, address team, address cat, address frok, address sahur)
        public
        view
    {
        require(address(club).code.length > 0 && address(club).code.length < 131_072, "code size");
        require(address(club.ENTROPY()) == entropy, "read-back ENTROPY");
        require(club.TEAM() == team, "read-back TEAM");
        require(club.CAT() == cat, "read-back CAT");
        require(club.FROK() == frok, "read-back FROK");
        require(club.SAHUR() == sahur, "read-back SAHUR");
        require(club.MIN_STAKE() == 1 ether && club.MAX_STAKE() == 1_000 ether, "read-back stakes");
        require(club.FEE_BPS() == 500, "read-back FEE_BPS");
        require(club.CHALLENGE_TTL() == 24 hours && club.ENTROPY_TIMEOUT() == 24 hours, "read-back times");
        require(club.LOOK_FOR() == 24 hours, "read-back LOOK_FOR");
        require(club.CALLBACK_GAS() == CALLBACK_GAS && club.PUSH_GAS() == 50_000, "read-back gas");
        require(club.fightCount() == 0 && club.openCount() == 0 && club.accounted() == 0, "read-back fresh");
        require(
            club.quote() == IEntropyV2(entropy).getFeeV2(IEntropyV2(entropy).getDefaultProvider(), CALLBACK_GAS),
            "read-back quote"
        );
    }

    function _eq(string memory a, string memory b) internal pure returns (bool) {
        return keccak256(bytes(a)) == keccak256(bytes(b));
    }
}
