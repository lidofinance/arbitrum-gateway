// SPDX-FileCopyrightText: 2024 Lido <info@lido.fi>
// SPDX-License-Identifier: GPL-3.0

pragma solidity 0.8.10;

import {ITokenRatePusher} from "../interfaces/ITokenRatePusher.sol";
import {ERC165} from "@openzeppelin/contracts/utils/introspection/ERC165.sol";

/// @dev For testing purposes.
contract OpStackTokenRatePusherWithOutOfGasErrorStub is ERC165, ITokenRatePusher {

    uint256 public constant OUT_OF_GAS_INCURRING_MAX = 1000000000000;

    mapping (uint256 => uint256) public data;

    function pushTokenRate() external {
        for (uint256 i = 0; i < OUT_OF_GAS_INCURRING_MAX; ++i) {
            data[i] = i;
        }
    }

    /// @inheritdoc ERC165
    function supportsInterface(bytes4 _interfaceId) public view virtual override returns (bool) {
        return (
            _interfaceId == type(ITokenRatePusher).interfaceId
            || super.supportsInterface(_interfaceId)
        );
    }
}
