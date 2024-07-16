// SPDX-FileCopyrightText: 2022 Lido <info@lido.fi>
// SPDX-License-Identifier: GPL-3.0

pragma solidity 0.8.10;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @author psirex
/// @notice Contains the required logic of the ERC20 standard as defined in the EIP. Additionally
///     provides methods for direct allowance increasing/decreasing.
contract ERC20Core is IERC20 {
    /// @inheritdoc IERC20
    uint256 public totalSupply;

    /// @inheritdoc IERC20
    mapping(address => uint256) public balanceOf;

    /// @inheritdoc IERC20
    mapping(address => mapping(address => uint256)) public allowance;

    /// @inheritdoc IERC20
    function approve(address spender_, uint256 amount_)
        external
        returns (bool)
    {
        _approve(msg.sender, spender_, amount_);
        return true;
    }

    /// @inheritdoc IERC20
    function transfer(address to_, uint256 amount_) external returns (bool) {
        _transfer(msg.sender, to_, amount_);
        return true;
    }

    /// @inheritdoc IERC20
    function transferFrom(
        address from_,
        address to_,
        uint256 amount_
    ) external returns (bool) {
        _spendAllowance(from_, msg.sender, amount_);
        _transfer(from_, to_, amount_);
        return true;
    }

    /// @dev Moves amount_ of tokens from sender_ to recipient_
    /// @param from_ An address of the sender of the tokens
    /// @param to_  An address of the recipient of the tokens
    /// @param amount_ An amount of tokens to transfer
    function _transfer(
        address from_,
        address to_,
        uint256 amount_
    ) internal onlyNonZeroAccount(from_) onlyNonZeroAccount(to_) {
        _decreaseBalance(from_, amount_);
        balanceOf[to_] += amount_;
        emit Transfer(from_, to_, amount_);
    }

    /// @dev Updates owner_'s allowance for spender_ based on spent amount_. Does not update
    ///     the allowance amount in case of infinite allowance
    /// @param owner_ An address of the account to spend allowance
    /// @param spender_  An address of the spender of the tokens
    /// @param amount_ An amount of allowance spend
    function _spendAllowance(
        address owner_,
        address spender_,
        uint256 amount_
    ) internal {
        uint256 currentAllowance = allowance[owner_][spender_];
        if (currentAllowance == type(uint256).max) {
            return;
        }
        if (amount_ > currentAllowance) {
            revert ErrorNotEnoughAllowance();
        }
        unchecked {
            _approve(owner_, spender_, currentAllowance - amount_);
        }
    }

    /// @dev Sets amount_ as the allowance of spender_ over the owner_'s tokens
    /// @param owner_ An address of the account to set allowance
    /// @param spender_  An address of the tokens spender
    /// @param amount_ An amount of tokens to allow to spend
    function _approve(
        address owner_,
        address spender_,
        uint256 amount_
    ) internal virtual onlyNonZeroAccount(owner_) onlyNonZeroAccount(spender_) {
        allowance[owner_][spender_] = amount_;
        emit Approval(owner_, spender_, amount_);
    }

    /// @dev Creates amount_ tokens and assigns them to account_, increasing the total supply
    /// @param account_ An address of the account to mint tokens
    /// @param amount_ An amount of tokens to mint
    function _mint(address account_, uint256 amount_)
        internal
        onlyNonZeroAccount(account_)
    {
        totalSupply += amount_;
        balanceOf[account_] += amount_;
        emit Transfer(address(0), account_, amount_);
    }

    /// @dev Destroys amount_ tokens from account_, reducing the total supply.
    /// @param account_ An address of the account to mint tokens
    /// @param amount_ An amount of tokens to mint
    function _burn(address account_, uint256 amount_)
        internal
        onlyNonZeroAccount(account_)
    {
        _decreaseBalance(account_, amount_);
        totalSupply -= amount_;
        emit Transfer(account_, address(0), amount_);
    }

    /// @dev Decreases the balance of the account_
    /// @param account_ An address of the account to decrease balance
    /// @param amount_ An amount of balance decrease
    function _decreaseBalance(address account_, uint256 amount_) internal {
        uint256 balance = balanceOf[account_];

        if (amount_ > balance) {
            revert ErrorNotEnoughBalance();
        }
        unchecked {
            balanceOf[account_] = balance - amount_;
        }
    }

    /// @dev validates that account_ is not zero address
    modifier onlyNonZeroAccount(address account_) {
        if (account_ == address(0)) {
            revert ErrorAccountIsZeroAddress();
        }
        _;
    }

    error ErrorNotEnoughBalance();
    error ErrorNotEnoughAllowance();
    error ErrorAccountIsZeroAddress();
    error ErrorDecreasedAllowanceBelowZero();
}
