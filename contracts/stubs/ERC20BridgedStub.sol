// SPDX-FileCopyrightText: 2024 Lido <info@lido.fi>
// SPDX-License-Identifier: GPL-3.0

pragma solidity 0.8.10;

import {IERC20Bridged} from "../token/ERC20Bridged.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @dev For testing purposes.
contract ERC20BridgedStub is IERC20Bridged, ERC20 {
    address public bridge;

    constructor(string memory name_, string memory symbol_)
        ERC20(name_, symbol_)
    {
        _mint(msg.sender, 1000000 * 10**18);
    }

    function setBridge(address bridge_) external {
        bridge = bridge_;
    }

    function bridgeMint(address account, uint256 amount) external {
        _mint(account, amount);
    }

    function bridgeBurn(address account, uint256 amount) external {
        _burn(account, amount);
    }
}
