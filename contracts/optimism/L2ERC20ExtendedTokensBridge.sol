// SPDX-FileCopyrightText: 2024 Lido <info@lido.fi>
// SPDX-License-Identifier: GPL-3.0

pragma solidity 0.8.10;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Address} from "@openzeppelin/contracts/utils/Address.sol";
import {IL1ERC20Bridge} from "./interfaces/IL1ERC20Bridge.sol";
import {IL2ERC20Bridge} from "./interfaces/IL2ERC20Bridge.sol";
import {IERC20Bridged} from "../token/ERC20Bridged.sol";
import {ITokenRateUpdatable} from "../optimism/interfaces/ITokenRateUpdatable.sol";
import {IERC20Wrapper} from "../token/interfaces/IERC20Wrapper.sol";
import {ERC20RebasableBridged} from "../token/ERC20RebasableBridged.sol";
import {BridgingManager} from "../BridgingManager.sol";
import {RebasableAndNonRebasableTokens} from "./RebasableAndNonRebasableTokens.sol";
import {CrossDomainEnabled} from "./CrossDomainEnabled.sol";
import {DepositDataCodec} from "../lib/DepositDataCodec.sol";

/// @author psirex, kovalgek
/// @notice The L2 token bridge works with the L1 token bridge to enable ERC20 token bridging
///     between L1 and L2. It acts as a minter for new tokens when it hears about
///     deposits into the L1 token bridge. It also acts as a burner of the tokens
///     intended for withdrawal, informing the L1 bridge to release L1 funds. Additionally, adds
///     the methods for bridging management: enabling and disabling withdrawals/deposits
contract L2ERC20ExtendedTokensBridge is
    IL2ERC20Bridge,
    BridgingManager,
    RebasableAndNonRebasableTokens,
    CrossDomainEnabled
{
    using SafeERC20 for IERC20;

    address private immutable L1_TOKEN_BRIDGE;

    /// @param messenger_ L2 messenger address being used for cross-chain communications
    /// @param l1TokenBridge_  Address of the corresponding L1 bridge
    /// @param l1TokenNonRebasable_ Address of the bridged token in the L1 chain
    /// @param l1TokenRebasable_ Address of the bridged token in the L1 chain
    /// @param l2TokenNonRebasable_ Address of the token minted on the L2 chain when token bridged
    /// @param l2TokenRebasable_ Address of the token minted on the L2 chain when token bridged
    constructor(
        address messenger_,
        address l1TokenBridge_,
        address l1TokenNonRebasable_,
        address l1TokenRebasable_,
        address l2TokenNonRebasable_,
        address l2TokenRebasable_
    ) CrossDomainEnabled(messenger_) RebasableAndNonRebasableTokens(
        l1TokenNonRebasable_,
        l1TokenRebasable_,
        l2TokenNonRebasable_,
        l2TokenRebasable_
    ) {
        L1_TOKEN_BRIDGE = l1TokenBridge_;
    }

    /// @inheritdoc IL2ERC20Bridge
    function l1TokenBridge() external view returns (address) {
        return L1_TOKEN_BRIDGE;
    }

    /// @inheritdoc IL2ERC20Bridge
    function withdraw(
        address l2Token_,
        uint256 amount_,
        uint32 l1Gas_,
        bytes calldata data_
    ) external
        whenWithdrawalsEnabled
        onlySupportedL2Token(l2Token_)
    {
        if (Address.isContract(msg.sender)) {
            revert ErrorSenderNotEOA();
        }
        _withdrawTo(l2Token_, msg.sender, msg.sender, amount_, l1Gas_, data_);
        emit WithdrawalInitiated(_l1Token(l2Token_), l2Token_, msg.sender, msg.sender, amount_, data_);
    }

    /// @inheritdoc IL2ERC20Bridge
    function withdrawTo(
        address l2Token_,
        address to_,
        uint256 amount_,
        uint32 l1Gas_,
        bytes calldata data_
    ) external
        whenWithdrawalsEnabled
        onlySupportedL2Token(l2Token_)
    {
        _withdrawTo(l2Token_, msg.sender, to_, amount_, l1Gas_, data_);
        emit WithdrawalInitiated(_l1Token(l2Token_), l2Token_, msg.sender, to_, amount_, data_);
    }

    /// @inheritdoc IL2ERC20Bridge
    function finalizeDeposit(
        address l1Token_,
        address l2Token_,
        address from_,
        address to_,
        uint256 amount_,
        bytes calldata data_
    )
        external
        whenDepositsEnabled()
        onlySupportedL1L2TokensPair(l1Token_, l2Token_)
        onlyFromCrossDomainAccount(L1_TOKEN_BRIDGE)
    {
        DepositDataCodec.DepositData memory depositData = DepositDataCodec.decodeDepositData(data_);
        ITokenRateUpdatable tokenRateOracle = ERC20RebasableBridged(L2_TOKEN_REBASABLE).TOKEN_RATE_ORACLE();
        tokenRateOracle.updateRate(depositData.rate, depositData.timestamp);

        uint256 depositedAmount = _mintTokens(l1Token_, l2Token_, to_, amount_);
        emit DepositFinalized(l1Token_, l2Token_, from_, to_, depositedAmount, depositData.data);
    }

    /// @notice Performs the logic for withdrawals by burning the token and informing
    ///     the L1 token Gateway of the withdrawal
    /// @param l2Token_ Address of L2 token where withdrawal was initiated.
    /// @param from_ Account to pull the withdrawal from on L2
    /// @param to_ Account to give the withdrawal to on L1
    /// @param amount_ Amount of the token to withdraw
    /// @param l1Gas_ Unused, but included for potential forward compatibility considerations
    /// @param data_ Optional data to forward to L1. This data is provided
    ///     solely as a convenience for external contracts. Aside from enforcing a maximum
    ///     length, these contracts provide no guarantees about its content
    function _withdrawTo(
        address l2Token_,
        address from_,
        address to_,
        uint256 amount_,
        uint32 l1Gas_,
        bytes calldata data_
    ) internal {
        uint256 amountToWithdraw = _burnTokens(l2Token_, from_, amount_);

        bytes memory message = abi.encodeWithSelector(
            IL1ERC20Bridge.finalizeERC20Withdrawal.selector,
            _l1Token(l2Token_), l2Token_, from_, to_, amountToWithdraw, data_
        );
        sendCrossDomainMessage(L1_TOKEN_BRIDGE, l1Gas_, message);
    }

    /// @dev Mints tokens.
    /// @param l1Token_ Address of L1 token for which deposit is finalizing.
    /// @param l2Token_ Address of L2 token for which deposit is finalizing.
    /// @param to_ Account that token mints for.
    /// @param amount_ Amount of token or shares to mint.
    /// @return returns amount of minted tokens.
    function _mintTokens(
        address l1Token_,
        address l2Token_,
        address to_,
        uint256 amount_
    ) internal returns (uint256) {
        if(_isRebasable(l1Token_)) {
            ERC20RebasableBridged(l2Token_).bridgeMintShares(to_, amount_);
            return ERC20RebasableBridged(l2Token_).getTokensByShares(amount_);
        }

        IERC20Bridged(l2Token_).bridgeMint(to_, amount_);
        return amount_;
    }

    /// @dev Burns tokens
    /// @param l2Token_ Address of L2 token where withdrawal was initiated.
    /// @param from_ Account which tokens are burns.
    /// @param amount_ Amount of token to burn.
    /// @return returns amount of non-rebasable token to withdraw.
    function _burnTokens(
        address l2Token_,
        address from_,
        uint256 amount_
    ) internal returns (uint256) {
        if(_isRebasable(l2Token_)) {
            uint256 shares = ERC20RebasableBridged(l2Token_).getSharesByTokens(amount_);
            ERC20RebasableBridged(l2Token_).bridgeBurnShares(from_, shares);
            return shares;
        }

        IERC20Bridged(l2Token_).bridgeBurn(from_, amount_);
        return amount_;
    }

    error ErrorSenderNotEOA();
}
