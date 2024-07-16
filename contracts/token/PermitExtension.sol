// SPDX-FileCopyrightText: 2024 OpenZeppelin, Lido <info@lido.fi>
// SPDX-License-Identifier: GPL-3.0

pragma solidity 0.8.10;

import {UnstructuredStorage} from "./UnstructuredStorage.sol";
import {EIP712} from "@openzeppelin/contracts-v4.9/utils/cryptography/EIP712.sol";
import {IERC2612} from "@openzeppelin/contracts-v4.9/interfaces/IERC2612.sol";
import {SignatureChecker} from "../lib/SignatureChecker.sol";

abstract contract PermitExtension is IERC2612, EIP712 {
    using UnstructuredStorage for bytes32;

    /// @dev Nonces for ERC-2612 (Permit)
    mapping(address => uint256) internal noncesByAddress;

    // TODO: outline structured storage used because at least EIP712 uses it


    /// @dev Typehash constant for ERC-2612 (Permit)
    ///
    /// keccak256("Permit(address owner,address spender,uint256 value,uint256 nonce,uint256 deadline)")
    ///
    bytes32 internal constant PERMIT_TYPEHASH =
        0x6e71edae12b1b97f4d1f60370fef10105fa2faae0126114a169c64845d6126c9;

    /// @param name_ The name of the token
    /// @param version_ The current major version of the signing domain (aka token version)
    constructor(
        string memory name_,
        string memory version_
    ) EIP712(name_, version_)
    {
    }

    /// @dev Sets `value` as the allowance of `spender` over ``owner``'s tokens,
    /// given ``owner``'s signed approval.
    ///  Emits an {Approval} event.
    ///
    ///  Requirements:
    ///
    ///  - `spender` cannot be the zero address.
    ///  - `deadline` must be a timestamp in the future.
    ///  - `v`, `r` and `s` must be a valid `secp256k1` signature from `owner`
    ///   over the EIP712-formatted function arguments.
    ///  - the signature must use ``owner``'s current nonce (see {nonces}).
    ///
    function permit(
        address _owner, address _spender, uint256 _value, uint256 _deadline, uint8 _v, bytes32 _r, bytes32 _s
    ) external {
        if (block.timestamp > _deadline) {
            revert ErrorDeadlineExpired();
        }

        bytes32 structHash = keccak256(
            abi.encode(PERMIT_TYPEHASH, _owner, _spender, _value, _useNonce(_owner), _deadline)
        );

        bytes32 hash = _hashTypedDataV4(structHash);

        if (!SignatureChecker.isValidSignature(_owner, hash, _v, _r, _s)) {
            revert ErrorInvalidSignature();
        }

        _permitAccepted(_owner, _spender, _value);
    }


    /// @dev Returns the current nonce for `owner`. This value must be
    /// included whenever a signature is generated for {permit}.
    ///
    /// Every successful call to {permit} increases ``owner``'s nonce by one. This
    /// prevents a signature from being used multiple times.
    ///
    function nonces(address owner) external view returns (uint256) {
        return noncesByAddress[owner];
    }

    /// @dev Returns the domain separator used in the encoding of the signature for {permit}, as defined by {EIP712}.
    // solhint-disable-next-line func-name-mixedcase
    function DOMAIN_SEPARATOR() external view returns (bytes32) {
        return _domainSeparatorV4();
    }


    /// @dev "Consume a nonce": return the current value and increment.
    function _useNonce(address _owner) internal returns (uint256 current) {
        current = noncesByAddress[_owner];
        noncesByAddress[_owner] = current + 1;
    }

    /// @dev Override this function in the inherited contract to invoke the approve() function of ERC20.
    function _permitAccepted(address owner_, address spender_, uint256 amount_) internal virtual;

    error ErrorInvalidSignature();
    error ErrorDeadlineExpired();
}
