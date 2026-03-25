// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console} from "forge-std/Script.sol";
import {PawToken} from "../src/PawToken.sol";

contract DeployPawToken is Script {
    function run() external {
        uint256 privateKey = vm.envUint("DEPLOYER_PRIVATE_KEY");

        vm.startBroadcast(privateKey);

        // Deployer gets initial 1,000,000 PAW
        address actualDeployer = vm.addr(privateKey);
        PawToken paw = new PawToken(actualDeployer);

        vm.stopBroadcast();

        console.log("==============================================");
        console.log("PawToken deployed to:", address(paw));
        console.log("Initial holder:      ", actualDeployer);
        console.log("Total supply:        ", paw.totalSupply());
        console.log("==============================================");
        console.log("Update PAYMENT_TOKEN_ADDRESS in .env and Railway to:", address(paw));
    }
}
