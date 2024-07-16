// SPDX-FileCopyrightText: 2022 Lido <info@lido.fi>
// SPDX-License-Identifier: GPL-3.0

pragma solidity 0.8.10;

import {IERC20Bridged} from "../token/ERC20Bridged.sol";
import {IL2TokenGateway, IInterchainTokenGateway} from "./interfaces/IL2TokenGateway.sol";

import {L2CrossDomainEnabled} from "./L2CrossDomainEnabled.sol";
import {L2OutboundDataParser} from "./libraries/L2OutboundDataParser.sol";
import {InterchainERC20TokenGateway} from "./InterchainERC20TokenGateway.sol";

/// @author psirex
/// @notice Contract implements ITokenGateway interface and with counterpart L1ERC20TokenGateway
///     allows bridging registered ERC20 compatible tokens between Arbitrum and Ethereum chains
contract L2ERC20TokenGateway is
    InterchainERC20TokenGateway,
    L2CrossDomainEnabled,
    IL2TokenGateway
{
    /// @param arbSys_ Address of the Arbitrum’s ArbSys contract in the L2 chain
    /// @param router_ Address of the router in the L2 chain
    /// @param counterpartGateway_ Address of the counterpart L1 gateway
    /// @param l1Token_ Address of the bridged token in the L1 chain
    /// @param l2Token_ Address of the token minted on the Arbitrum chain when token bridged
    constructor(
        address arbSys_,
        address router_,
        address counterpartGateway_,
        address l1Token_,
        address l2Token_
    )
        InterchainERC20TokenGateway(
            router_,
            counterpartGateway_,
            l1Token_,
            l2Token_
        )
        L2CrossDomainEnabled(arbSys_)
    {}

    /// @inheritdoc IL2TokenGateway
    function outboundTransfer(
        address l1Token_,
        address to_,
        uint256 amount_,
        uint256, // maxGas
        uint256, // gasPriceBid
        bytes calldata data_
    )
        external
        whenWithdrawalsEnabled
        onlySupportedL1Token(l1Token_)
        returns (bytes memory res)
    {
        address from = L2OutboundDataParser.decode(router, data_);

        IERC20Bridged(l2Token).bridgeBurn(from, amount_);

        uint256 id = sendCrossDomainMessage(
            from,
            counterpartGateway,
            getOutboundCalldata(l1Token_, from, to_, amount_, "")
        );

        // The current implementation doesn't support fast withdrawals, so we
        // always use 0 for the exitNum argument in the event
        emit WithdrawalInitiated(l1Token_, from, to_, id, 0, amount_);

        return abi.encode(id);
    }

    /// @inheritdoc IInterchainTokenGateway
    function finalizeInboundTransfer(
        address l1Token_,
        address from_,
        address to_,
        uint256 amount_,
        bytes calldata
    )
        external
        whenDepositsEnabled
        onlySupportedL1Token(l1Token_)
        onlyFromCrossDomainAccount(counterpartGateway)
    {
        IERC20Bridged(l2Token).bridgeMint(to_, amount_);

        emit DepositFinalized(l1Token_, from_, to_, amount_);
    }
}
