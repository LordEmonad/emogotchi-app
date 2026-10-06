// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script, console} from "forge-std/Script.sol";
import {EmogotchiItems} from "../src/EmogotchiItems.sol";

/**
 * After DeployThiccums: from the shop's curator, allow the Thiccumsgotchi collection in the item shop. That is all he
 * needs: every gate already on chain follows `collectionAllowed` (AnyPetGate for the emo hair, NamedPetGate for
 * the Halloween three and the Habibi pack; the witch's NamedCatGate is the cat's alone), so the hair, the
 * Halloween three, the rooms, the Jewish pack and the Habibi pack are his the moment this lands, with the site
 * passing his collection as the hint.
 *
 *   ITEMS=0x09b0CD33E1a4905265A12BD10989F5C29d3b1B91 THICCUMS=0x… forge script script/WireThiccums.s.sol \
 *     --rpc-url https://rpc.monad.xyz --broadcast --account emogotchi \
 *     --sender 0x40aD8cF176672Efe12a0D7AC50fa5da2b0b64e74 --gas-estimate-multiplier 200
 *
 * `allowCollection` ran out of gas at forge's estimate twice before (Monad's cold access costs more than the
 * Ethereum schedule forge estimates with): if the broadcast reverts, re-send it by hand with
 * `cast send <ITEMS> "allowCollection(address)" <THICCUMS> --gas-limit 300000 --account emogotchi`.
 * `allowCollection` is one-way. Dry-run first without --broadcast.
 */
contract WireThiccums is Script {
    function run() external {
        EmogotchiItems items = EmogotchiItems(payable(vm.envAddress("ITEMS")));
        address thiccums = vm.envAddress("THICCUMS");
        require(items.curator() == msg.sender, "the broadcaster is not the curator");
        require(thiccums.code.length > 0, "THICCUMS has no code");
        console.log("shop   ", address(items));
        console.log("curator", items.curator());
        console.log("thiccums", thiccums);
        console.log("allowed already?", items.collectionAllowed(thiccums));
        vm.startBroadcast();
        if (!items.collectionAllowed(thiccums)) items.allowCollection(thiccums);
        vm.stopBroadcast();
        console.log("allowed", items.collectionAllowed(thiccums));
    }
}
