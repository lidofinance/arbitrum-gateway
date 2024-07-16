// SPDX-FileCopyrightText: 2024 Lido <info@lido.fi>
// SPDX-License-Identifier: GPL-3.0

pragma solidity 0.8.10;

import {IERC20Bridged} from "../token/ERC20Bridged.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20WstETH} from "../optimism/L1LidoTokensBridge.sol";
import {IERC20Wrapper} from "../token/interfaces/IERC20Wrapper.sol";

/// @dev represents wstETH on L1. For testing purposes.
contract ERC20WrapperStub is IERC20Wrapper, IERC20WstETH, ERC20 {

    IERC20 public stETH;
    address public bridge;
    uint256 public tokensRate;

    constructor(IERC20 stETH_, string memory name_, string memory symbol_)
        ERC20(name_, symbol_)
    {
        stETH = stETH_;

        tokensRate = 2 * 10 **18;
        _mint(msg.sender, 1000000 * 10**18);
    }

    function wrap(uint256 _stETHAmount) external returns (uint256) {
        require(_stETHAmount > 0, "wstETH: can't wrap zero stETH");

        uint256 wstETHAmount = (_stETHAmount * (10 ** uint256(decimals()))) / tokensRate;

        _mint(msg.sender, wstETHAmount);
        stETH.transferFrom(msg.sender, address(this), _stETHAmount);

        return wstETHAmount;
    }

    function unwrap(uint256 _wstETHAmount) external returns (uint256) {
        require(_wstETHAmount > 0, "wstETH: zero amount unwrap not allowed");

        uint256 stETHAmount = (_wstETHAmount * tokensRate) / (10 ** uint256(decimals()));

        _burn(msg.sender, _wstETHAmount);
        stETH.transfer(msg.sender, stETHAmount);

        return stETHAmount;
    }

    function stEthPerToken() external view returns (uint256) {
        return tokensRate;
    }
}
