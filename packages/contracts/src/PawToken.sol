// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title PawToken
 * @notice ERC-20 + EIP-3009 token for PawClaw platform (PAW)
 * @dev Implements EIP-3009 transferWithAuthorization (USDC/Centre pattern)
 *      and EIP-2612 nonces() for compatibility.
 */
contract PawToken {
    // ─── ERC-20 state ────────────────────────────────────────────────────────

    string public constant name     = "PawClaw Token";
    string public constant symbol   = "PAW";
    uint8  public constant decimals = 18;

    uint256 public totalSupply;

    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    // ─── EIP-712 domain ──────────────────────────────────────────────────────

    bytes32 public immutable DOMAIN_SEPARATOR;

    bytes32 public constant TRANSFER_WITH_AUTHORIZATION_TYPEHASH =
        keccak256(
            "TransferWithAuthorization(address from,address to,uint256 value,uint256 validAfter,uint256 validBefore,bytes32 nonce)"
        );

    bytes32 public constant CANCEL_AUTHORIZATION_TYPEHASH =
        keccak256(
            "CancelAuthorization(address authorizer,bytes32 nonce)"
        );

    // ─── EIP-3009 state ──────────────────────────────────────────────────────

    // authorizer => nonce => used
    mapping(address => mapping(bytes32 => bool)) private _authorizationStates;

    // EIP-2612 compatibility: sequential nonces (not used by EIP-3009 but
    // required by OKX TEE interface check)
    mapping(address => uint256) public nonces;

    // ─── Events ──────────────────────────────────────────────────────────────

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);
    event AuthorizationUsed(address indexed authorizer, bytes32 indexed nonce);
    event AuthorizationCanceled(address indexed authorizer, bytes32 indexed nonce);

    // ─── Errors ──────────────────────────────────────────────────────────────

    error ERC20InsufficientBalance(address sender, uint256 balance, uint256 needed);
    error ERC20InsufficientAllowance(address spender, uint256 allowance, uint256 needed);
    error AuthorizationExpired();
    error AuthorizationNotYetValid();
    error AuthorizationAlreadyUsed(address authorizer, bytes32 nonce);
    error InvalidSignature();

    // ─── Constructor ─────────────────────────────────────────────────────────

    constructor(address initialHolder) {
        DOMAIN_SEPARATOR = keccak256(
            abi.encode(
                keccak256(
                    "EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"
                ),
                keccak256(bytes(name)),
                keccak256(bytes("1")),
                block.chainid,
                address(this)
            )
        );

        uint256 initialSupply = 1_000_000 * 10 ** decimals;
        totalSupply = initialSupply;
        balanceOf[initialHolder] = initialSupply;
        emit Transfer(address(0), initialHolder, initialSupply);
    }

    // ─── ERC-20 ──────────────────────────────────────────────────────────────

    function transfer(address to, uint256 value) external returns (bool) {
        _transfer(msg.sender, to, value);
        return true;
    }

    function approve(address spender, uint256 value) external returns (bool) {
        allowance[msg.sender][spender] = value;
        emit Approval(msg.sender, spender, value);
        return true;
    }

    function transferFrom(address from, address to, uint256 value) external returns (bool) {
        uint256 allowed = allowance[from][msg.sender];
        if (allowed != type(uint256).max) {
            if (allowed < value) revert ERC20InsufficientAllowance(msg.sender, allowed, value);
            allowance[from][msg.sender] = allowed - value;
        }
        _transfer(from, to, value);
        return true;
    }

    function _transfer(address from, address to, uint256 value) internal {
        uint256 bal = balanceOf[from];
        if (bal < value) revert ERC20InsufficientBalance(from, bal, value);
        unchecked {
            balanceOf[from] = bal - value;
            balanceOf[to]  += value;
        }
        emit Transfer(from, to, value);
    }

    // ─── EIP-3009 ────────────────────────────────────────────────────────────

    /**
     * @notice Returns whether a nonce has been used for a given authorizer.
     */
    function authorizationState(address authorizer, bytes32 nonce) external view returns (bool) {
        return _authorizationStates[authorizer][nonce];
    }

    /**
     * @notice Execute a transfer with a signed authorization (EIP-3009).
     * @dev The `nonce` here is a random bytes32 chosen by the authorizer,
     *      NOT a sequential nonce (that's EIP-2612 which uses `nonces()`).
     */
    function transferWithAuthorization(
        address from,
        address to,
        uint256 value,
        uint256 validAfter,
        uint256 validBefore,
        bytes32 nonce,
        uint8   v,
        bytes32 r,
        bytes32 s
    ) external {
        _requireValidAuthorization(from, nonce, validAfter, validBefore);

        bytes32 digest = _buildTransferHash(from, to, value, validAfter, validBefore, nonce);
        _requireValidSignature(from, digest, v, r, s);

        _markAuthorizationUsed(from, nonce);
        _transfer(from, to, value);
    }

    /**
     * @notice Cancel a previously created authorization.
     */
    function cancelAuthorization(
        address authorizer,
        bytes32 nonce,
        uint8   v,
        bytes32 r,
        bytes32 s
    ) external {
        if (_authorizationStates[authorizer][nonce]) {
            revert AuthorizationAlreadyUsed(authorizer, nonce);
        }

        bytes32 digest = keccak256(
            abi.encodePacked(
                "\x19\x01",
                DOMAIN_SEPARATOR,
                keccak256(abi.encode(CANCEL_AUTHORIZATION_TYPEHASH, authorizer, nonce))
            )
        );
        _requireValidSignature(authorizer, digest, v, r, s);

        _markAuthorizationUsed(authorizer, nonce);
        emit AuthorizationCanceled(authorizer, nonce);
    }

    // ─── Internal helpers ────────────────────────────────────────────────────

    function _buildTransferHash(
        address from,
        address to,
        uint256 value,
        uint256 validAfter,
        uint256 validBefore,
        bytes32 nonce
    ) internal view returns (bytes32) {
        return keccak256(
            abi.encodePacked(
                "\x19\x01",
                DOMAIN_SEPARATOR,
                keccak256(
                    abi.encode(
                        TRANSFER_WITH_AUTHORIZATION_TYPEHASH,
                        from,
                        to,
                        value,
                        validAfter,
                        validBefore,
                        nonce
                    )
                )
            )
        );
    }

    function _requireValidAuthorization(
        address authorizer,
        bytes32 nonce,
        uint256 validAfter,
        uint256 validBefore
    ) internal view {
        if (block.timestamp <= validAfter)  revert AuthorizationNotYetValid();
        if (block.timestamp >= validBefore) revert AuthorizationExpired();
        if (_authorizationStates[authorizer][nonce]) {
            revert AuthorizationAlreadyUsed(authorizer, nonce);
        }
    }

    function _requireValidSignature(
        address signer,
        bytes32 digest,
        uint8   v,
        bytes32 r,
        bytes32 s
    ) internal pure {
        address recovered = ecrecover(digest, v, r, s);
        if (recovered == address(0) || recovered != signer) revert InvalidSignature();
    }

    function _markAuthorizationUsed(address authorizer, bytes32 nonce) internal {
        _authorizationStates[authorizer][nonce] = true;
        emit AuthorizationUsed(authorizer, nonce);
    }
}
