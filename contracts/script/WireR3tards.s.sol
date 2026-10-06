// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script, console} from "forge-std/Script.sol";
import {EmogotchiItems} from "../src/EmogotchiItems.sol";

/**
 * After DeployR3tards: from the shop's curator, allow the r3tardgotchi collection in the item shop. That is all he
 * needs: every gate already on chain follows `collectionAllowed` (AnyPetGate for the emo hair, NamedPetGate for
 * the Halloween three and the Habibi pack; the witch's NamedCatGate is the cat's alone), so the hair, the
 * Halloween three, the rooms, the Jewish pack and the Habibi pack are his the moment this lands, with the site
 * passing his collection as the hint.
 *
 *   ITEMS=0x09b0CD33E1a4905265A12BD10989F5C29d3b1B91 R3TARDS=0x… forge script script/WireR3tards.s.sol \
 *     --rpc-url https://rpc.monad.xyz --broadcast --account emogotchi \
 *     --sender 0x40aD8cF176672Efe12a0D7AC50fa5da2b0b64e74 --gas-estimate-multiplier 200
 *
 * `allowCollection` ran out of gas at forge's estimate twice before (Monad's cold access costs more than the
 * Ethereum schedule forge estimates with): if the broadcast reverts, re-send it by hand with
 * `cast send <ITEMS> "allowCollection(address)" <R3TARDS> --gas-limit 300000 --account emogotchi`.
 * `allowCollection` is one-way. Dry-run first without --broadcast.
 */
contract WireR3tards is Script {
    function run() external {
        EmogotchiItems items = EmogotchiItems(payable(vm.envAddress("ITEMS")));
        address r3tards = vm.envAddress("R3TARDS");
        require(items.curator() == msg.sender, "the broadcaster is not the curator");
        require(r3tards.code.length > 0, "R3TARDS has no code");
        console.log("shop   ", address(items));
        console.log("curator", items.curator());
        console.log("r3tards", r3tards);
        console.log("allowed already?", items.collectionAllowed(r3tards));
        vm.startBroadcast();
        if (!items.collectionAllowed(r3tards)) items.allowCollection(r3tards);
        vm.stopBroadcast();
        console.log("allowed", items.collectionAllowed(r3tards));
    }
}
