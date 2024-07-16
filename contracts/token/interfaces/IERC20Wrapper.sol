// SPDX-FileCopyrightText: 2024 Lido <info@lido.fi>
// SPDX-License-Identifier: GPL-3.0

pragma solidity 0.8.10;

/// @author kovalgek
/// @notice Extends the ERC20 functionality that allows to wrap/unwrap token.
interface IERC20Wrapper {

    /// @notice Exchanges wrappable token to wrapper one.
    /// @param wrappableTokenAmount_ amount of wrappable token to wrap.
    /// @return Amount of wrapper token user receives after wrap.
    function wrap(uint256 wrappableTokenAmount_) external returns (uint256);

    /// @notice Exchanges wrapper token to wrappable one.
    /// @param wrapperTokenAmount_ amount of wrapper token to uwrap in exchange for wrappable.
    /// @return Amount of wrappable token user receives after unwrap.
    function unwrap(uint256 wrapperTokenAmount_) external returns (uint256);
}
