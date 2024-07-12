// SPDX-FileCopyrightText: 2022 Lido <info@lido.fi>
// SPDX-License-Identifier: GPL-3.0

pragma solidity 0.8.10;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import {IERC20Bridged} from "../token/interfaces/IERC20Bridged.sol";


interface IL1TokenBridge {
    function depositERC20To(
        address l1Token_,
        address l2Token_,
        address to_,
        uint256 amount_,
        uint32 l2Gas_,
        bytes calldata data_
    ) external;
}

error ZeroAddress();

error WrapETHFailed();

error ZeroAmount();

error InsufficientWstETHReceived();

contract StakeHelper is ReentrancyGuard {
    IERC20 public immutable l1Token;

    address public immutable l2Token;

    IL1TokenBridge public immutable l1TokenBridge;

    event Stake(address indexed staker, uint256 indexed amount);

    constructor(
        address l1Token_, 
        address l2Token_,
        address l1TokenBridge_
    ) {
        l1Token = IERC20(l1Token_);
        l2Token = l2Token_;
        l1TokenBridge = IL1TokenBridge(l1TokenBridge_);
    }

    // Wrap sender's ETH to wstETH and bridge to L2
    function stakeETH(
        address to,
        uint32 l2Gas_,
        bytes calldata data_
    ) external payable nonReentrant {
        if (to == address(0)) {
            revert ZeroAddress();
        }
        uint256 amount = msg.value;
        if (amount == 0) {
            revert ZeroAmount();
        }
        // wstETH on L1 will automatically wrap sent Ether in `receive` function
        (bool success, ) = address(l1Token).call{value: msg.value}("");
        if (!success) {
            revert WrapETHFailed();
        }
        // double check amount
        if (l1Token.balanceOf(address(this)) < amount) {
            revert InsufficientWstETHReceived();
        }
        // now the wstETH is at this contract, bridge to L2 in behalf of the sender
        // 1. approve token bridge to use `l1Token` of this contract
        l1Token.approve(address(l1TokenBridge), amount);
        // 2. actual cross bridge transfer
        l1TokenBridge.depositERC20To(address(l1Token), l2Token, msg.sender, amount, l2Gas_, data_);

        emit Stake(msg.sender, amount);
    }

}
