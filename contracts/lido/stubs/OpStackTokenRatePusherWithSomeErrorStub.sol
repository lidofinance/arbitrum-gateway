// SPDX-FileCopyrightText: 2024 Lido <info@lido.fi>
// SPDX-License-Identifier: GPL-3.0

pragma solidity 0.8.10;

import {ITokenRatePusher} from "../interfaces/ITokenRatePusher.sol";
import {ERC165} from "@openzeppelin/contracts/utils/introspection/ERC165.sol";

/// @dev For testing purposes.
contract OpStackTokenRatePusherWithSomeErrorStub is ERC165, ITokenRatePusher {

    error SomeError();

    function pushTokenRate() pure external {
        revert SomeError();
    }

    /// @inheritdoc ERC165
    function supportsInterface(bytes4 _interfaceId) public view virtual override returns (bool) {
        return (
            _interfaceId == type(ITokenRatePusher).interfaceId
            || super.supportsInterface(_interfaceId)
        );
    }
}
