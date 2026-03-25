// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test, console} from "forge-std/Test.sol";
import {PawToken} from "../src/PawToken.sol";

contract PawTokenTest is Test {
    PawToken public token;
    uint256 aliceKey = 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80;
    address alice;
    address bob = address(0xB0b);

    function setUp() public {
        alice = vm.addr(aliceKey);
        token = new PawToken(alice);
    }

    // ── ERC-20 basic ────────────────────────────────────────────────────────

    function test_metadata() public {
        assertEq(keccak256(bytes(token.name())),   keccak256(bytes("PawClaw Token")));
        assertEq(keccak256(bytes(token.symbol())), keccak256(bytes("PAW")));
        assertEq(token.decimals(), 18);
    }

    function test_initialSupply() public {
        uint256 expected = 1_000_000 * 10 ** 18;
        assertEq(token.totalSupply(),     expected);
        assertEq(token.balanceOf(alice),  expected);
    }

    function test_transfer() public {
        vm.prank(alice);
        token.transfer(bob, 100 ether);
        assertEq(token.balanceOf(bob),   100 ether);
        assertEq(token.balanceOf(alice), 1_000_000 ether - 100 ether);
    }

    // ── EIP-3009 ────────────────────────────────────────────────────────────

    function _buildAuthDigest(
        address from, address to, uint256 value,
        uint256 validAfter, uint256 validBefore, bytes32 nonce
    ) internal view returns (bytes32) {
        bytes32 structHash = keccak256(abi.encode(
            token.TRANSFER_WITH_AUTHORIZATION_TYPEHASH(),
            from, to, value, validAfter, validBefore, nonce
        ));
        return keccak256(abi.encodePacked("\x19\x01", token.DOMAIN_SEPARATOR(), structHash));
    }

    function test_transferWithAuthorization() public {
        uint256 amount = 500 ether;
        uint256 validAfter  = block.timestamp - 1;
        uint256 validBefore = block.timestamp + 1 hours;
        bytes32 nonce = keccak256("random-nonce-1");

        bytes32 digest = _buildAuthDigest(alice, bob, amount, validAfter, validBefore, nonce);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(aliceKey, digest);

        token.transferWithAuthorization(alice, bob, amount, validAfter, validBefore, nonce, v, r, s);

        assertEq(token.balanceOf(bob),  amount);
        assertTrue(token.authorizationState(alice, nonce));
    }

    function test_transferWithAuthorization_revertIfReused() public {
        uint256 amount = 100 ether;
        uint256 validAfter  = block.timestamp - 1;
        uint256 validBefore = block.timestamp + 1 hours;
        bytes32 nonce = keccak256("nonce-reuse");

        bytes32 digest = _buildAuthDigest(alice, bob, amount, validAfter, validBefore, nonce);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(aliceKey, digest);

        token.transferWithAuthorization(alice, bob, amount, validAfter, validBefore, nonce, v, r, s);

        vm.expectRevert(abi.encodeWithSelector(PawToken.AuthorizationAlreadyUsed.selector, alice, nonce));
        token.transferWithAuthorization(alice, bob, amount, validAfter, validBefore, nonce, v, r, s);
    }

    function test_transferWithAuthorization_revertIfExpired() public {
        bytes32 nonce = keccak256("expired");
        bytes32 digest = _buildAuthDigest(alice, bob, 100 ether, 0, block.timestamp - 1, nonce);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(aliceKey, digest);

        vm.expectRevert(PawToken.AuthorizationExpired.selector);
        token.transferWithAuthorization(alice, bob, 100 ether, 0, block.timestamp - 1, nonce, v, r, s);
    }

    function test_transferWithAuthorization_revertIfNotYetValid() public {
        bytes32 nonce = keccak256("future");
        uint256 futureTime = block.timestamp + 1 hours;
        bytes32 digest = _buildAuthDigest(alice, bob, 100 ether, futureTime, futureTime + 1 hours, nonce);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(aliceKey, digest);

        vm.expectRevert(PawToken.AuthorizationNotYetValid.selector);
        token.transferWithAuthorization(alice, bob, 100 ether, futureTime, futureTime + 1 hours, nonce, v, r, s);
    }

    function test_cancelAuthorization() public {
        bytes32 nonce = keccak256("to-cancel");
        bytes32 cancelHash = keccak256(abi.encode(token.CANCEL_AUTHORIZATION_TYPEHASH(), alice, nonce));
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", token.DOMAIN_SEPARATOR(), cancelHash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(aliceKey, digest);

        token.cancelAuthorization(alice, nonce, v, r, s);
        assertTrue(token.authorizationState(alice, nonce));
    }

    function test_noncesExist() public {
        // nonces() must exist for OKX TEE compatibility check
        assertEq(token.nonces(alice), 0);
    }
}
