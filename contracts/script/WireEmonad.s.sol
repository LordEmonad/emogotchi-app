// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script, console} from "forge-std/Script.sol";
import {EmogotchiItems} from "../src/EmogotchiItems.sol";

/**
 * After DeployEmonad: from the shop's curator, allow the Emonadgotchi collection in the item shop. That is all he
 * needs: every gate already on chain follows `collectionAllowed` (AnyPetGate for the emo hair, NamedPetGate for
 * the Halloween three and the Habibi pack; the witch's NamedCatGate is the cat's alone), so the hair, the
 * Halloween three, the rooms, the Jewish pack and the Habibi pack are his the moment this lands, with the site
 * passing his collection as the hint.
 *
 *   ITEMS=0x09b0CD33E1a4905265A12BD10989F5C29d3b1B91 EMONAD=0x… forge script script/WireEmonad.s.sol \
 *     --rpc-url https://rpc.monad.xyz --broadcast --account emogotchi \
 *     --sender 0x40aD8cF176672Efe12a0D7AC50fa5da2b0b64e74 --gas-estimate-multiplier 200
 *
 * `allowCollection` ran out of gas at forge's estimate twice before (Monad's cold access costs more than the
 * Ethereum schedule forge estimates with): if the broadcast reverts, re-send it by hand with
 * `cast send <ITEMS> "allowCollection(address)" <EMONAD> --gas-limit 300000 --account emogotchi`.
 * `allowCollection` is one-way. Dry-run first without --broadcast.
 */
contract WireEmonad is Script {
    function run() external {
        EmogotchiItems items = EmogotchiItems(payable(vm.envAddress("ITEMS")));
        address emonad = vm.envAddress("EMONAD");
        require(items.curator() == msg.sender, "the broadcaster is not the curator");
        require(emonad.code.length > 0, "EMONAD has no code");
        console.log("shop   ", address(items));
        console.log("curator", items.curator());
        console.log("emonad", emonad);
        console.log("allowed already?", items.collectionAllowed(emonad));
        vm.startBroadcast();
        if (!items.collectionAllowed(emonad)) items.allowCollection(emonad);
        vm.stopBroadcast();
        console.log("allowed", items.collectionAllowed(emonad));
    }
}
