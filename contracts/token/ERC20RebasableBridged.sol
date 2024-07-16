// SPDX-FileCopyrightText: 2024 Lido <info@lido.fi>
// SPDX-License-Identifier: GPL-3.0

pragma solidity 0.8.10;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IERC20Wrapper} from "./interfaces/IERC20Wrapper.sol";
import {ITokenRateOracle} from "../optimism/TokenRateOracle.sol";
import {ERC20Metadata} from "./ERC20Metadata.sol";
import {UnstructuredRefStorage} from "./UnstructuredRefStorage.sol";
import {UnstructuredStorage} from "./UnstructuredStorage.sol";

/// @author kovalgek
/// @notice Extends the ERC20 functionality that allows the bridge to mint/burn shares
interface IERC20BridgedShares is IERC20 {
    /// @notice Returns bridge which can mint and burn shares on L2
    function L2_ERC20_TOKEN_BRIDGE() external view returns (address);

    /// @notice Creates amount_ shares and assigns them to account_, increasing the total shares supply
    /// @param account_ An address of the account to mint shares
    /// @param amount_ An amount of shares to mint
    function bridgeMintShares(address account_, uint256 amount_) external;

    /// @notice Destroys amount_ shares from account_, reducing the total shares supply
    /// @param account_ An address of the account to burn shares
    /// @param amount_ An amount of shares to burn
    function bridgeBurnShares(address account_, uint256 amount_) external;
}

/// @author kovalgek
/// @notice Rebasable token that wraps/unwraps non-rebasable token and allow to mint/burn tokens by bridge.
contract ERC20RebasableBridged is IERC20, IERC20Wrapper, IERC20BridgedShares, ERC20Metadata {
    using SafeERC20 for IERC20;
    using UnstructuredRefStorage for bytes32;
    using UnstructuredStorage for bytes32;

    /// @inheritdoc IERC20BridgedShares
    address public immutable L2_ERC20_TOKEN_BRIDGE;

    /// @notice Contract of non-rebasable token to wrap from.
    IERC20 public immutable TOKEN_TO_WRAP_FROM;

    /// @notice Oracle contract used to get token rate for wrapping/unwrapping tokens.
    ITokenRateOracle public immutable TOKEN_RATE_ORACLE;

    /// @dev token allowance slot position.
    bytes32 internal constant TOKEN_ALLOWANCE_POSITION = keccak256("ERC20RebasableBridged.TOKEN_ALLOWANCE_POSITION");

    /// @dev user shares slot position.
    bytes32 internal constant SHARES_POSITION = keccak256("ERC20RebasableBridged.SHARES_POSITION");

    /// @dev token shares slot position.
    bytes32 internal constant TOTAL_SHARES_POSITION = keccak256("ERC20RebasableBridged.TOTAL_SHARES_POSITION");

    /// @param name_ The name of the token
    /// @param symbol_ The symbol of the token
    /// @param decimals_ The decimals places of the token
    /// @param tokenToWrapFrom_ address of the ERC20 token to wrap
    /// @param tokenRateOracle_ address of oracle that returns tokens rate
    /// @param l2ERC20TokenBridge_ The bridge address which allows to mint/burn tokens
    constructor(
        string memory name_,
        string memory symbol_,
        uint8 decimals_,
        address tokenToWrapFrom_,
        address tokenRateOracle_,
        address l2ERC20TokenBridge_
    ) ERC20Metadata(name_, symbol_, decimals_) {
        TOKEN_TO_WRAP_FROM = IERC20(tokenToWrapFrom_);
        TOKEN_RATE_ORACLE = ITokenRateOracle(tokenRateOracle_);
        L2_ERC20_TOKEN_BRIDGE = l2ERC20TokenBridge_;
    }

    /// @notice Sets the name and the symbol of the tokens if they both are empty
    /// @param name_ The name of the token
    /// @param symbol_ The symbol of the token
    function initialize(string memory name_, string memory symbol_) external {
        _setERC20MetadataName(name_);
        _setERC20MetadataSymbol(symbol_);
    }

    /// @inheritdoc IERC20Wrapper
    function wrap(uint256 sharesAmount_) external returns (uint256) {
        if (sharesAmount_ == 0) revert ErrorZeroSharesWrap();

        _mintShares(msg.sender, sharesAmount_);
        TOKEN_TO_WRAP_FROM.safeTransferFrom(msg.sender, address(this), sharesAmount_);

        return _getTokensByShares(sharesAmount_);
    }

    /// @inheritdoc IERC20Wrapper
    function unwrap(uint256 tokenAmount_) external returns (uint256) {
        if (tokenAmount_ == 0) revert ErrorZeroTokensUnwrap();

        uint256 sharesAmount = _getSharesByTokens(tokenAmount_);
        _burnShares(msg.sender, sharesAmount);
        TOKEN_TO_WRAP_FROM.safeTransfer(msg.sender, sharesAmount);

        return sharesAmount;
    }

    /// @inheritdoc IERC20BridgedShares
    function bridgeMintShares(address account_, uint256 amount_) external onlyBridge {
        _mintShares(account_, amount_);
    }

    /// @inheritdoc IERC20BridgedShares
    function bridgeBurnShares(address account_, uint256 amount_) external onlyBridge {
        _burnShares(account_, amount_);
    }

    /// @inheritdoc IERC20
    function allowance(address owner, address spender) external view returns (uint256) {
        return _getTokenAllowance()[owner][spender];
    }

    /// @inheritdoc IERC20
    function totalSupply() external view returns (uint256) {
        return _getTokensByShares(_getTotalShares());
    }

    /// @inheritdoc IERC20
    function balanceOf(address account_) external view returns (uint256) {
        return _getTokensByShares(_sharesOf(account_));
    }

    /// @notice Get shares amount of the provided account.
    /// @param account_ provided account address.
    /// @return amount of shares owned by `_account`.
    function sharesOf(address account_) external view returns (uint256) {
        return _sharesOf(account_);
    }

    /// @return total amount of shares.
    function getTotalShares() external view returns (uint256) {
        return _getTotalShares();
    }

    /// @notice Get amount of tokens for a given amount of shares.
    /// @param sharesAmount_ amount of shares.
    /// @return amount of tokens for a given shares amount.
    function getTokensByShares(uint256 sharesAmount_) external view returns (uint256) {
        return _getTokensByShares(sharesAmount_);
    }

    /// @notice Get amount of shares for a given amount of tokens.
    /// @param tokenAmount_ provided tokens amount.
    /// @return amount of shares for a given tokens amount.
    function getSharesByTokens(uint256 tokenAmount_) external view returns (uint256) {
        return _getSharesByTokens(tokenAmount_);
    }

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

    function _getTokenAllowance() internal pure returns (mapping(address => mapping(address => uint256)) storage) {
        return TOKEN_ALLOWANCE_POSITION.storageMapAddressMapAddressUint256();
    }

    /// @notice Amount of shares (locked wstETH amount) owned by the holder.
    function _getShares() internal pure returns (mapping(address => uint256) storage) {
        return SHARES_POSITION.storageMapAddressAddressUint256();
    }

    /// @notice The total amount of shares in existence.
    function _getTotalShares() internal view returns (uint256) {
        return TOTAL_SHARES_POSITION.getStorageUint256();
    }

    /// @notice Set total amount of shares.
    function _setTotalShares(uint256 _newTotalShares) internal {
        TOTAL_SHARES_POSITION.setStorageUint256(_newTotalShares);
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
        uint256 sharesToTransfer = _getSharesByTokens(amount_);
        _transferShares(from_, to_, sharesToTransfer);
        _emitTransferEvents(from_, to_, amount_ ,sharesToTransfer);
    }

    /// @dev Updates owner_'s allowance for spender_ based on spent amount_. Does not update
    ///     the allowance amount in case of infinite allowance
    /// @param owner_ An address of the account to spend allowance
    /// @param spender_ An address of the spender of the tokens
    /// @param amount_ An amount of allowance spend
    function _spendAllowance(
        address owner_,
        address spender_,
        uint256 amount_
    ) internal {
        uint256 currentAllowance = _getTokenAllowance()[owner_][spender_];
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
    /// @param spender_ An address of the tokens spender
    /// @param amount_ An amount of tokens to allow to spend
    function _approve(
        address owner_,
        address spender_,
        uint256 amount_
    ) internal virtual onlyNonZeroAccount(owner_) onlyNonZeroAccount(spender_) {
        _getTokenAllowance()[owner_][spender_] = amount_;
        emit Approval(owner_, spender_, amount_);
    }

    function _sharesOf(address account_) internal view returns (uint256) {
        return _getShares()[account_];
    }

    function _getTokensByShares(uint256 sharesAmount_) internal view returns (uint256) {
        (uint256 tokensRate, uint256 decimals) = _getTokenRateAndDecimal();
        return (sharesAmount_ * tokensRate) / (10 ** decimals);
    }

    function _getSharesByTokens(uint256 tokenAmount_) internal view returns (uint256) {
        (uint256 tokensRate, uint256 decimals) = _getTokenRateAndDecimal();
        return (tokenAmount_ * (10 ** decimals)) / tokensRate;
    }

    function _getTokenRateAndDecimal() internal view returns (uint256, uint256) {
        uint8 rateDecimals = TOKEN_RATE_ORACLE.decimals();

        if (rateDecimals == uint8(0)) revert ErrorTokenRateDecimalsIsZero();

        //slither-disable-next-line unused-return
        (
            /* roundId_ */,
            int256 answer,
            /* startedAt_ */,
            uint256 updatedAt,
            /* answeredInRound_ */
        ) = TOKEN_RATE_ORACLE.latestRoundData();

        if (updatedAt == 0) revert ErrorWrongOracleUpdateTime();

        return (uint256(answer), uint256(rateDecimals));
    }

    /// @dev Creates amount_ shares and assigns them to account_, increasing the total shares supply
    /// @param recipient_ An address of the account to mint shares
    /// @param amount_ An amount of shares to mint
    function _mintShares(
        address recipient_,
        uint256 amount_
    ) internal onlyNonZeroAccount(recipient_) {
        _setTotalShares(_getTotalShares() + amount_);
        _getShares()[recipient_] = _getShares()[recipient_] + amount_;
        uint256 tokensAmount = _getTokensByShares(amount_);
        _emitTransferEvents(address(0), recipient_, tokensAmount ,amount_);
    }

    /// @dev Destroys amount_ shares from account_, reducing the total shares supply.
    /// @param account_ An address of the account to mint shares
    /// @param amount_ An amount of shares to mint
    function _burnShares(
        address account_,
        uint256 amount_
    ) internal onlyNonZeroAccount(account_) {
        uint256 accountShares = _getShares()[account_];
        if (accountShares < amount_) revert ErrorNotEnoughBalance();
        _setTotalShares(_getTotalShares() - amount_);
        _getShares()[account_] = accountShares - amount_;
        emit Transfer(account_, address(0), amount_);
    }

    /// @dev  Moves `sharesAmount_` shares from `sender_` to `recipient_`.
    /// @param sender_ An address of the account to take shares
    /// @param recipient_ An address of the account to transfer shares
    /// @param sharesAmount_ An amount of shares to transfer
    function _transferShares(
        address sender_,
        address recipient_,
        uint256 sharesAmount_
    ) internal onlyNonZeroAccount(sender_) onlyNonZeroAccount(recipient_) {

        if (recipient_ == address(this)) revert ErrorTrasferToRebasableContract();

        uint256 currentSenderShares = _getShares()[sender_];
        if (sharesAmount_ > currentSenderShares) revert ErrorNotEnoughBalance();

        _getShares()[sender_] = currentSenderShares - sharesAmount_;
        _getShares()[recipient_] = _getShares()[recipient_] + sharesAmount_;
    }

    /// @dev Emits `Transfer` and `TransferShares` events
    function _emitTransferEvents(
        address _from,
        address _to,
        uint256 _tokenAmount,
        uint256 _sharesAmount
    ) internal {
        emit Transfer(_from, _to, _tokenAmount);
        emit TransferShares(_from, _to, _sharesAmount);
    }

    /// @dev validates that account_ is not zero address
    modifier onlyNonZeroAccount(address account_) {
        if (account_ == address(0)) {
            revert ErrorAccountIsZeroAddress();
        }
        _;
    }

    /// @dev Validates that sender of the transaction is the bridge
    modifier onlyBridge() {
        if (msg.sender != L2_ERC20_TOKEN_BRIDGE) {
            revert ErrorNotBridge();
        }
        _;
    }

    /// @notice An executed shares transfer from `sender` to `recipient`.
    /// @dev emitted in pair with an ERC20-defined `Transfer` event.
    event TransferShares(
        address indexed from,
        address indexed to,
        uint256 sharesValue
    );

    error ErrorZeroSharesWrap();
    error ErrorZeroTokensUnwrap();
    error ErrorTokenRateDecimalsIsZero();
    error ErrorWrongOracleUpdateTime();
    error ErrorTrasferToRebasableContract();
    error ErrorNotEnoughBalance();
    error ErrorNotEnoughAllowance();
    error ErrorAccountIsZeroAddress();
    error ErrorDecreasedAllowanceBelowZero();
    error ErrorNotBridge();
}
