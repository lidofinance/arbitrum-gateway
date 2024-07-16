# Lido's Optimism Bridge

The document details the implementation of the bridging of the ERC20 compatible tokens[^*] between Ethereum and Optimism chains.

It's the first step of Lido's integration into the Optimism protocol. The main goal of the current implementation is to be the strong foundation for the long-term goals of the Lido expansion in the Optimism chain. The long-run picture of the Lido's integration into L2s includes:

- Bridging of Lido's tokens from L1 to L2 chains
- Instant ETH staking on L2 chains with receiving stETH/wstETH on the corresponding L2 immediately
- Keeping UX on L2 as close as possible to the UX on Ethereum mainnet

At this point, the implementation must provide a scalable and reliable solution for Lido to bridge ERC20 compatible tokens between Optimism and the Ethereum chain.

[^*]: The current implementation might not support the non-standard functionality of the ERC20 tokens. For example, rebasable tokens or tokens with transfers fee will work incorrectly. In case your token implements some non-typical ERC20 logic, make sure it is compatible with the bridge before usage.

## Optimism's Bridging Flow

The default implementation of the Optimism bridging solution consists of two parts: `L1StandardBridge` and `L2StandardBridge`. These contracts allow bridging the ERC20 tokens between Ethereum and Optimism chains.

In the standard bridge, when ERC20 is deposited on L1 and transferred to the bridge contract it remains "locked" there while the equivalent amount is minted in the L2 token. For withdrawals, the opposite happens the L2 token amount is burned then the same amount of L1 tokens is transferred to the recipient.

The default Optimism bridge is suitable for the short-term goal of the Lido (bridging of the wstETH token into Optimism), but it complicates the achievement of the long-term goals. For example, implementation of the staking from L2's very likely will require extending the token and gateway implementations.

Additionally, Optimism provides functionality to implement the custom bridge solution utilizing the same cross-domain infrastructure as the Standard bridge. The only constraint for the custom bridge to be compatible with the default Optimism Gateway is the implementation of the `IL1ERC20Bridge` and `IL2ERC20Bridge` interfaces.

The rest of the document provides a technical specification of the bridge Lido will use to transfer tokens between Ethereum and Optimism chains.

## Lido's Bridge Implementation

The current implementation of the tokens bridge provides functionality to bridge the specified type of ERC20 compatible token between Ethereum and Optimism chains. Additionally, the bridge provides some administrative features, like the **temporary disabling of the deposits and withdrawals**. It's necessary when bridging must be disabled fast because of the malicious usage of the bridge or vulnerability in the contracts. Also, it might be helpful in the implementation upgrade process.

The technical implementation focuses on the following requirements for the contracts:

- **Scalability** - current implementation must provide the ability to be extended with new functionality in the future.
- **Simplicity** - implemented contracts must be clear, simple, and expressive for developers who will work with code in the future.
- **Gas efficiency** - implemented solution must be efficient in terms of gas costs for the end-user, but at the same time, it must not violate the previous requirement.

A high-level overview of the proposed solution might be found in the below diagram:

![](https://i.imgur.com/yAF9gbl.png)

- [**`BridgingManager`**](#BridgingManager) - contains administrative methods to retrieve and control the state of the bridging process.
- [**`BridgeableTokens`**](#BridgeableTokens) - contains the logic for validation of tokens used in the bridging process.
- [**`CrossDomainEnabled`**](#CrossDomainEnabled) - helper contract for contracts performing cross-domain communications
- [**`L1ERC20ExtendedTokensBridge`**](#L1ERC20ExtendedTokensBridge) - Ethereum's counterpart of the bridge to bridge registered ERC20 compatible tokens between Ethereum and Optimism chains.
- [**`L2ERC20ExtendedTokensBridge`**](#L2ERC20ExtendedTokensBridge) - Optimism's counterpart of the bridge to bridge registered ERC20 compatible tokens between Ethereum and Optimism chains
- [**`ERC20Bridged`**](#ERC20Bridged) - an implementation of the `ERC20` token with administrative methods to mint and burn tokens.
- [**`OssifiableProxy`**](#OssifiableProxy) - the ERC1967 proxy with extra admin functionality.

## BridgingManager

- **inherits:** [`@openzeppelin/AccessControl`](https://github.com/OpenZeppelin/openzeppelin-contracts/blob/d4fb3a89f9d0a39c7ee6f2601d33ffbf30085322/contracts/access/AccessControl.sol)

Contains administrative methods to retrieve and control the state of the bridging process. Allows to enable/disable withdrawals or deposits and check whether the gateway functionality is suspended or not. Allows granting standalone privileges to certain accounts to enable/disable deposits or withdrawals of the gateway. The rights to grant permissions have accounts with an admin role.

### Constants

- **DEPOSITS_ENABLER_ROLE** - a `bytes32` equal to a result of the `keccak256()` hashing of the string `"BridgingManager.DEPOSITS_ENABLER_ROLE"`. This role must be used when grants/revokes privileges to enable deposits.
- **DEPOSITS_DISABLER_ROLE** - a `bytes32` equal to a result of the `keccak256()` hashing of the string `"BridgingManager.DEPOSITS_DISABLER_ROLE"`. This role must be used when grants/revokes privileges to disable deposits.
- **WITHDRAWALS_ENABLER_ROLE** - a `bytes32` equal to a result of the `keccak256()` hashing of the string `"BridgingManager.WITHDRAWALS_ENABLER_ROLE"`. This role must be used when grants/revokes privileges to enable withdrawals.
- **WITHDRAWALS_DISABLER_ROLE** - a `bytes32` equal to a result of the `keccak256()` hashing of the string `"BridgingManager.WITHDRAWALS_DISABLER_ROLE"`. This role must be used when grants/revokes privileges to disable withdrawals.

### Variables

The contract uses the Unstructured Storage pattern to store the current state of the bridge using the struct `BridgingState`. `BridgingState` struct has the next type:

```solidity=
struct BridgingState {
    bool isInitialized; // Shows whether the contract is initialized or not.
    bool isDepositsEnabled; // Stores the state of the deposits
    bool isWithdrawalsEnabled; // Stores the state of the withdrawals
}
```

### Functions

#### `initialize(address)`

> **Visibility:** &nbsp;&nbsp;&nbsp; `public`
>
> **Arguments:**
>
> - **`admin_`** - an address of the account to grant the `DEFAULT_ADMIN_ROLE`
>
> **Emits:** `RoleGranted(bytes32 indexed role, address indexed account, address indexed sender)`

Initializes the contract to grant `DEFAULT_ADMIN_ROLE` to the `admin_` address. The method might be called only once. Reverts with error `ErrorAlreadyInitialized()` when called on the already initialized contract. Allows using this contract with the proxy pattern.

#### `isDepositsEnabled()`

> **Visibility:** &nbsp;&nbsp;&nbsp; `public`
>
> **Mutability:** &nbsp; `view`
>
> **Returns** &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; `(bool)`

Returns whether the deposits enabled or not.

#### `isWithdrawalsEnabled()`

> **Visibility:** &nbsp;&nbsp;&nbsp; `public`
>
> **Mutability:** &nbsp; `view`
>
> **Returns** &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; `(bool)`

Returns whether the withdrawals enabled or not.

#### `enableDeposits()`

> **Visibility:** &nbsp;&nbsp;&nbsp; `external`
>
> **Modifiers:** &nbsp;&nbsp; [`onlyRole(DEPOSITS_ENABLER_ROLE)`](https://github.com/OpenZeppelin/openzeppelin-contracts/blob/d4fb3a89f9d0a39c7ee6f2601d33ffbf30085322/contracts/access/AccessControl.sol#L69)
>
> **Emits:** &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; `DepositsEnabled(address account)`

Enables the deposits if they are disabled. Reverts with the error `ErrorDepositsEnabled()` if deposits are enabled. Only accounts with the granted `DEPOSITS_ENABLER_ROLE` can call this method.

#### `disableDeposits()`

> **Visibility:** &nbsp;&nbsp;&nbsp; `external`
>
> **Modifiers:** &nbsp;&nbsp; [`whenDepositsEnabled`](#whenDepositsEnabled) [`onlyRole(DEPOSITS_DISABLER_ROLE)`](https://github.com/OpenZeppelin/openzeppelin-contracts/blob/d4fb3a89f9d0a39c7ee6f2601d33ffbf30085322/contracts/access/AccessControl.sol#L69)
>
> **Emits:** &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; `DepositsDisabled(address account)`

Disables the deposits if they aren't disabled yet. Reverts with the error `ErrorDepositsDisabled()` if deposits have already disabled. Only accounts with the granted `DEPOSITS_DISABLER_ROLE` can call this method.

#### `enableWithdrawals()`

> **Visibility:** &nbsp;&nbsp;&nbsp; `external`
>
> **Modifiers:** &nbsp;&nbsp; [`onlyRole(WITHDRAWALS_ENABLER_ROLE)`](https://github.com/OpenZeppelin/openzeppelin-contracts/blob/d4fb3a89f9d0a39c7ee6f2601d33ffbf30085322/contracts/access/AccessControl.sol#L69)
>
> **Emits:** &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; `WithdrawalsEnabled(address account)`

Enables the withdrawals if they are disabled. Reverts with the error `ErrorWithdrawalsEnabled()` if withdrawals are enabled. Only accounts with the granted `WITHDRAWALS_ENABLER_ROLE` can call this method.

#### `disableWithdrawals()`

> **Visibility:** &nbsp;&nbsp;&nbsp; `external`
>
> **Modifiers:** &nbsp;&nbsp; [`whenWithdrawalsEnabled`](#whenWithdrawalsEnabled)[`onlyRole(WITHDRAWALS_DISABLER_ROLE)`](https://github.com/OpenZeppelin/openzeppelin-contracts/blob/d4fb3a89f9d0a39c7ee6f2601d33ffbf30085322/contracts/access/AccessControl.sol#L69)
>
> **Emits:** &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; `WithdrawalsDisabled(address account)`

Disables the withdrawals if they aren't disabled yet. Reverts with the error `ErrorWithdrawalsDisabled()` if withdrawals have already disabled. Only accounts with the granted `WITHDRAWALS_DISABLER_ROLE` can call this method.

#### `_loadState()`

> **Visibility:** &nbsp;&nbsp;&nbsp; `private`
>
> **Mutability:** &nbsp; `pure`
>
> **Returns** &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; `(BridgingState storage)`

Loads and returns the `BridgingState` variable from the slot at address `keccak256("BridgingManager.bridgingState")`.

### Modifiers

#### `whenDepositsEnabled()`

Validates that deposits are enabled. Reverts with the error `ErrorDepositsDisabled()` when called on contract with disabled deposits.

#### `whenWithdrawalsEnabled()`

Validates that withdrawals are enabled. Reverts with the error `ErrorWithdrawalsDisabled()` when called on contract with disabled withdrawals.

## BridgeableTokens

Contains the logic for validation of tokens used in the bridging process

### Variables

The contract keeps the addresses of L1/L2 tokens used in the bridging:

- **`l1Token`** - an immutable address of the bridged token in the L1 chain
- **`l2Token`** - an immutable address of the token minted on the L2 chain when token bridged

### Modifiers

#### `onlySupportedL1Token(address l1Token_)`

Validates that passed `l1Token_` is supported by the bridge. Reverts with error `ErrorUnsupportedL1Token()` when addresses mismatch.

#### `onlySupportedL2Token(address l2Token_)`

Validates that passed `l2Token_` is supported by the bridge. Reverts with error `ErrorUnsupportedL2Token()` when addresses mismatch.

## `CrossDomainEnabled`

**Implements:** [`ICrossDomainMessenger`](https://github.com/ethereum-optimism/optimism/blob/develop/packages/contracts/contracts/libraries/bridge/ICrossDomainMessenger.sol)

Helper contract for contracts performing cross-domain communications.

### Variables

- **`messenger`** - an immutable address of the contract used to send and receive messages from the other domain.

### Functions

#### `sendCrossDomainMessage(address,uint32,bytes memory)`

> **Visibility:** `internal`
>
> **Arguments:**
>
> - **`crossDomainTarget_`** - the intended recipient on the destination domain.
> - **`gasLimit_`** - the gasLimit for the receipt of the message on the target domain.
> - **`message_`** - the data to send to the target (usually calldata to a function with `onlyFromCrossDomainAccount()`)

Sends a message to an account on another domain.

### Modifiers

#### `onlyFromCrossDomainAccount(address _sourceDomainAccount)`

Enforces that the modified function is only callable by a specific cross-domain account.

## `L1ERC20ExtendedTokensBridge`

**Implements:** [`IL1ERC20Bridge`](https://github.com/ethereum-optimism/optimism/blob/develop/packages/contracts/contracts/L1/messaging/IL1ERC20Bridge.sol)
**Inherits:** [`BridgingManager`](#BridgingManager) [`BridgeableTokens`](#BridgeableTokens) [`CrossDomainEnabled`](#CrossDomainEnabled)

The L1 Standard bridge is a contract that locks bridged token on L1 side, send deposit messages on L2 side and finalize token withdrawals from L2.

### Variables

- **`l2TokenBridge`** An immutable address of a corresponding L2 Bridge

### Functions

#### `depositERC20(address,address,uint256,uint32,bytes calldata)`

> **Visibility:** `external`
>
> **Modifier:** [`whenDepositsEnabled`](#whenDepositsEnabled) [`onlySupportedL1Token(_l1Token)`](#modifier-onlySupportedL1Tokenaddress-l1Token_) [`onlySupportedL2Token(_l2Token)`](#modifier-onlySupportedL2Tokenaddress-l2Token_)
>
> **Arguments:**
>
> - **`l1Token_`** - address of the L1 ERC20.
> - **`l2Token_`** - address of the L1 respective L2 ERC20.
> - **`from_`** - account to pull the deposit from on L1
> - **`amount_`** - amount of the ERC20 to deposit.
> - **`l2Gas_`** - gas limit required to complete the deposit on L2.
> - **`data_`** - optional data to forward to L2. This data is provided solely as a convenience for external contracts. Aside from enforcing a maximum length, these contracts provide no guarantees about its content.

Initiate bridging of ERC-20 token `l1Token_` on L1 side to `l2Token_` on L2 side to the message sender.

#### `depositERC20To(address _l1Token, address _l2Token, address _to, uint256 _amount, uint32 _l2Gas, bytes calldata _data)`

> **Visibility:** `external`
>
> **Modifier:** [`whenDepositsEnabled`](#whenDepositsEnabled) [`onlySupportedL1Token(_l1Token)`](#modifier-onlySupportedL1Tokenaddress-l1Token_) [`onlySupportedL2Token(_l2Token)`](#modifier-onlySupportedL2Tokenaddress-l2Token_)
>
> **Arguments:**
>
> - **`l1Token_`** - address of the L1 ERC20.
> - **`l2Token_`** - address of the L1 respective L2 ERC20.
> - **`from_`** - account to pull the deposit from on L1
> - **`to_`** - account to give the deposit to on L2
> - **`amount_`** - amount of the ERC20 to deposit.
> - **`l2Gas_`** - gas limit required to complete the deposit on L2.
> - **`data_`** - optional data to forward to L2. This data is provided solely as a convenience for external contracts. Aside from enforcing a maximum length, these contracts provide no guarantees about its content.

Initiate bridging of ERC-20 token on L1 side to L2 to specified recipient.

#### `finalizeERC20Withdrawal(address,address,address,address,uint256,bytes calldata)`

> **Visibility:** `external`
>
> **Modifier:** [`whenWithdrawalsEnabled()`](#whenWithdrawalsEnabled) [`onlySupportedL1Token(_l1Token)`](#modifier-onlySupportedL1Tokenaddress-l1Token_) [`onlySupportedL2Token(_l2Token)`](#modifier-onlySupportedL2Tokenaddress-l2Token_) [`onlyFromCrossDomainAccount(l2TokenBridge)`](#onlyFromCrossDomainAccountaddress-_sourceDomainAccount)
>
> **Arguments:**
>
> - **`l1Token_`** - address of the L1 ERC20.
> - **`l2Token_`** - address of the L1 respective L2 ERC20.
> - **`from_`** - account to pull the deposit from on L1
> - **`to_`** - account to give the deposit to on L2
> - **`amount_`** - amount of the ERC20 to deposit.
> - **`l2Gas_`** - gas limit required to complete the deposit on L2.
> - **`data_`** - optional data to forward to L2. This data is provided solely as a convenience for external contracts. Aside from enforcing a maximum length, these contracts provide no guarantees about its content.
>
> **Emits:** `ERC20WithdrawalFinalized(address indexed _l1Token, address indexed _l2Token, address indexed _from, address _to, uint256 _amount, bytes _data)`

Complete a withdrawal from L2 to L1, and credit funds to the recipient's balance of the L1 ERC20 token. This call will fail if the initialized withdrawal from L2 has not been finalized.

#### `_initiateERC20Deposit(address,address,uint256,uint32,bytes calldata)`

> **Visibility:** `internal`
>
> **Arguments:**
>
> - **`from_`** - account to pull the deposit from on L1
> - **`to_`** - account to give the deposit to on L2
> - **`amount_`** - amount of the ERC20 to deposit.
> - **`l2Gas_`** - gas limit required to complete the deposit on L2.
> - **`data_`** - optional data to forward to L2. This data is provided solely as a convenience for external contracts. Aside from enforcing a maximum length, these contracts provide no guarantees about its content.
>
> **Emits:** `ERC20DepositInitiated(address indexed _l1Token, address indexed _l2Token, address indexed _from, address _to, uint256 _amount, bytes _data)`

Performs the logic for deposits by informing the L2 Deposited Token contract of the deposit and calling safeTransferFrom to lock the L1 funds.

## `L2ERC20ExtendedTokensBridge`

**Implements:** [`IL2ERC20Bridge`](https://github.com/ethereum-optimism/optimism/blob/develop/packages/contracts/contracts/L2/messaging/IL2ERC20Bridge.sol)
**Extends** [`BridgingManager`](#BridgingManager) [`BridgeableTokens`](#BridgeableTokens) [`CrossDomainEnabled`](#CrossDomainEnabled)

The L2 token bridge is a contract that works with the L1 Token bridge to enable ERC20 token bridging between L1 and L2. This contract acts as a minter for new tokens when it hears about deposits into the L1 token bridge. This contract also acts as a burner of the tokens intended for withdrawal, informing the L1 bridge to release L1 funds.

### Variables

- **`l1TokenBridge`** - address of the counterpart `L1TokenBridge`

### Functions

#### `withdraw(address,amount,uint32,bytes calldata)`

> **Visibility:** `external`
>
> **Modifier:** [`whenWithdrawalsEnabled()`](#whenWithdrawalsEnabled) [`onlySupportedL2Token(_l2Token)`](#modifier-onlySupportedL2Tokenaddress-l2Token_)
>
> **Arguments:**
>
> - **l2Token\_** - address of L2 token where withdrawal was initiated.
> - **amount\_** - amount of the token to withdraw
> - **l1Gas\_** - unused, but included for potential forward compatibility considerations
> - **data\_** - optional data to forward to L1. This data is provided solely as a convenience for external contracts. Aside from enforcing a maximum length, these contracts provide no guarantees about its content.

Initiate a withdraw of some tokens to the caller's account on L1.

#### `withdrawTo(address,address,amount,uint32,bytes calldata)`

> **Visibility:** `external`
>
> **Modifier:** [`whenWithdrawalsEnabled()`](#whenWithdrawalsEnabled) [`onlySupportedL2Token(_l2Token)`](#modifier-onlySupportedL2Tokenaddress-l2Token_)
>
> **Arguments:**
>
> - **l2Token\_** - address of L2 token where withdrawal was initiated.
> - **to\_** - L1 address to credit the withdrawal to.
> - **amount\_** - amount of the token to withdraw
> - **l1Gas\_** - unused, but included for potential forward compatibility considerations
> - **data\_** - optional data to forward to L1. This data is provided solely as a convenience for external contracts. Aside from enforcing a maximum length, these contracts provide no guarantees about its content.

Initiate a withdraw of some token to a recipient's account on L1.

#### `finalizeDeposit(address,address,address,address,uint256,bytes calldata)`

> **Visibility:** `external`
>
> **Modifiers:** [`whenDepositsEnabled`](#whenDepositsEnabled) [`onlySupportedL1Token(_l1Token)`](#modifier-onlySupportedL1Tokenaddress-l1Token_) [`onlySupportedL2Token(_l2Token)`](#modifier-onlySupportedL2Tokenaddress-l2Token_) [`onlyFromCrossDomainAccount(l2TokenBridge)`](#onlyFromCrossDomainAccountaddress-_sourceDomainAccount)
>
> **Arguments:**
>
> - **l1Token\_** - address for the l1 token this is called with
> - **l2Token\_** - address for the l2 token this is called with.
> - **from\_** - account to pull the deposit from on L2.
> - **to\_** - address to receive the withdrawal at.
> - **amount\_** - amount of the token to withdraw
> - **l1Gas\_** - unused, but included for potential forward compatibility considerations
> - **data\_** - data provider by the sender on L1. This data is provided solely as a convenience for external contracts. Aside from enforcing a maximum length, these contracts provide no guarantees about its content.
>
> **Emits:** `DepositFinalized(address indexed _l1Token, address indexed _l2Token, address indexed _from, address _to, uint256 _amount, bytes _data)`

Complete a deposit from L1 to L2, and credits funds to the recipient's balance of this L2 token. This call will fail if it did not originate from a corresponding deposit in `L1StandardTokenBridge`.

#### `_initiateWithdrawal(address,address,addrress,uint256,uint32,bytes calldata)`

> **Visibility:** `internal`
>
> **Arguments:**
>
> - **from\_** - account to pull the withdrawal from on L2.
> - **to\_** - account to give the withdrawal to on L1.
> - **amount\_** - amount of the token to withdraw.
> - **l1Gas\_** - unused, but included for potential forward compatibility considerations.
> - **data\_** - optional data to forward to L1. This data is provided solely as a convenience for external contracts. Aside from enforcing a maximum length, these contracts provide no guarantees about its content.
>
> **Emits:** `WithdrawalInitiated(address indexed _l1Token, address indexed _l2Token, address indexed _from, address _to, uint256 _amount, bytes _data)`

Performs the logic for withdrawals by burning the token and informing the L1 token Gateway of the withdrawal.

## `ERC20Metadata`

Contains optional methods for the `ERC20` tokens. It uses the UnstructuredStorage pattern to store strings with name and symbol info. Might be used with the upgradable proxies.

### Variables

Contract declares `public` and `immutable` variable **`decimals`** of type `uint8`.

The `name` and `symbol` info are stored in the structure:

```solidity=
struct DynamicMetadata {
    string name;
    string symbol;
}
```

### Functions

#### `name()`

> **Visibility:** &nbsp;&nbsp;&nbsp; `external`
>
> **Mutability:** &nbsp; `view`
>
> **Returns** &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; `(string memory)`

Returns the name of the token.

#### `symbol()`

> **Visibility:** &nbsp;&nbsp;&nbsp; `external`
>
> **Mutability:** &nbsp; `view`
>
> **Returns** &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; `(string memory)`

Returns the symbol of the token.

#### `_setERC20MetadataName(string memory)`

> **Visibility:** &nbsp;&nbsp;&nbsp; `internal`
>
> **Arguments:**
>
> - **`name_`** - string with name of the token

Sets the `name` of the token. Might be called only when the `name` is empty.

#### `_setERC20MetadataSymbol(string memory)`

> **Visibility:** &nbsp;&nbsp;&nbsp; `internal`
>
> **Arguments:**
>
> - **`symbol_`** - string with symbol of the token

Sets the `symbol` of the token. Might be called only when the `symbol` is empty.

#### `_loadDynamicMetadata()`

> **Visibility:** &nbsp;&nbsp;&nbsp; `private`
>
> **Mutability:** &nbsp; `pure`
>
> **Returns** &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; `(DynamicMetadata storage r)`

Returns the reference to the slot with `DynamicMetadata` struct

## `ERC20Core`

- **Implements:** [`@openzeppelin/IERC20`](https://github.com/OpenZeppelin/openzeppelin-contracts/blob/d4fb3a89f9d0a39c7ee6f2601d33ffbf30085322/contracts/token/ERC20/IERC20.sol)

Contains the required variables and logic of the `ERC20` token. The contract is a slightly modified version of the [`ERC20`](https://github.com/OpenZeppelin/openzeppelin-contracts/blob/d4fb3a89f9d0a39c7ee6f2601d33ffbf30085322/contracts/token/ERC20/ERC20.sol) contract from the OpenZeppelin package.

### Variables

Contract declares the following variables to store state of the token:

- **`uint256 public totalSupply`** - the total supply of the token
- **`mapping(address => uint256) public balanceOf`** - stores balances of the token holders
- **`mapping(address => mapping(address => uint256)) public allowance`** - stores allowances of the token holders

### Functions

#### `approve(address,uint256)`

> **Visibility:** &nbsp;&nbsp;&nbsp; `external`
>
> **Returns** &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; `(bool)`
>
> **Arguments:**
>
> - **`spender_`** - an address of the tokens spender
> - **`amount_`** - a number of tokens to allow to spend
>
> **Emits:** `Approval(address indexed owner, address indexed spender, uint256 value)`

Allows _spender to withdraw from the `msg.sender` account multiple times, up to the `amount_`. If this function is called again it overwrites the current allowance with `amount\_`. Returns a `bool` value indicating whether the operation succeeded.

#### `transfer(address,uint256)`

> **Visibility:** &nbsp;&nbsp;&nbsp; `external`
>
> **Returns** &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; `(bool)`
>
> **Arguments:**
>
> - **`to_`** - an address of the recipient of the tokens
> - **`amount_`** - a number of tokens to transfer
>
> **Emits:** `Transfer(address indexed from, address indexed to, uint256 value)`

Transfers `amount` of tokens from sender to `to` account.
Returns a `bool` value indicating whether the operation succeeded.

#### `transferFrom(address,address,uint256)`

> **Visibility:** &nbsp;&nbsp;&nbsp; `external`
>
> **Returns** &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; `(bool)`
>
> **Arguments:**
>
> - **`from_`** - an address to transfer tokens from
> - **`to_`** - an address of the recipient of the tokens
> - **`amount_`** - a number of tokens to transfer
>
> **Emits:** `Transfer(address indexed from, address indexed to, uint256 value)` `Approval(address indexed owner, address indexed spender, uint256 value)`

Transfers `amount` of token from the `from_` account to `to_` using the allowance mechanism. `amount_` is then deducted from the caller's allowance. Returns a `bool` value indicating whether the operation succeed.

## `ERC20Bridged`

**Implements:** [`IERC20Bridged`](https://github.com/lidofinance/lido-l2/blob/main/contracts/token/ERC20Bridged.sol)
**Inherits:** [`ERC20Metadata`](#ERC20Metadata) [`ERC20Core`](#ERC20CoreLogic)

Inherits the `ERC20` default functionality that allows the bridge to mint and burn tokens.

### Variables

Contract declares an immutable variable **`bridge`** which can mint/burn the token.

### Functions

#### `mint(address,uint256)`

> **Visibility:** &nbsp;&nbsp;&nbsp; `external`
>
> **Modifiers:** &nbsp;&nbsp; [`onlyBridge`](#onlybridge)
>
> **Arguments:**
>
> - **`account_`** - an address of the tokens recipient
> - **`amount_`** - a number to mint
>
> **Emits:** `Transfer(address indexed from, address indexed to, uint256 value)`

Mints the `amount_` of tokens to the `account_`. The method might be called only by the bridge. Reverts with the error `ErrorNotBridge()` when called not by bridge.

#### `burn(address,uint256)`

> **Visibility:** &nbsp;&nbsp;&nbsp; `external`
>
> **Modifiers:** &nbsp;&nbsp; [`onlyBridge`](#onlybridge)
>
> **Arguments:**
>
> - **`account_`** - an address of the tokens recipient
> - **`amount_`** - a number to burn
>
> **Emits:** `Transfer(address indexed from, address indexed to, uint256 value)`

Destroys the `amount_` of tokens from the `account_`. The method might be called only by the bridge. Reverts with the error `ErrorNotBridge()` when called not by bridge.

### Modifiers

#### `onlyBridge()`

Validates that the `msg.sender` of the method is the `bridge`. Reverts with error `ErrorNotBridge()` in other cases.

## `OssifiableProxy`

- **Inherits:** [`@openzeppelin/ERC1967Proxy`](https://github.com/OpenZeppelin/openzeppelin-contracts/blob/d4fb3a89f9d0a39c7ee6f2601d33ffbf30085322/contracts/proxy/ERC1967/ERC1967Proxy.sol)

Extends the [`ERC1967Proxy`](https://github.com/OpenZeppelin/openzeppelin-contracts/blob/d4fb3a89f9d0a39c7ee6f2601d33ffbf30085322/contracts/proxy/ERC1967/ERC1967Proxy.sol) contract from the OpenZeppelin package and adds some admin methods. In contrast to [`UUPSUpgradableProxy`](https://github.com/OpenZeppelin/openzeppelin-contracts/blob/d4fb3a89f9d0a39c7ee6f2601d33ffbf30085322/contracts/proxy/utils/UUPSUpgradeable.sol), it doesn't increase the inheritance chain of the implementation contracts. And allows saving one extra `SLOAD` operation on every user request in contrast to [`TransparentUpgradeableProxy`](https://github.com/OpenZeppelin/openzeppelin-contracts/blob/d4fb3a89f9d0a39c7ee6f2601d33ffbf30085322/contracts/proxy/transparent/TransparentUpgradeableProxy.sol). But adding any external methods to the `ERC1967Proxy` creates the risk of selectors clashing, as described in the OpenZeppelin [proxies docs](https://docs.openzeppelin.com/upgrades-plugins/1.x/proxies#transparent-proxies-and-function-clashes). To avoid the risk of clashing, the implementation upgrade process must contain a step with a search of the collisions between proxy and implementation.

### Functions

#### `proxy__getAdmin()`

> **Visibility:** &nbsp;&nbsp;&nbsp; `external`
>
> **Mutability:** &nbsp; `view`
>
> **Returns** &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; `(address)`

Returns the admin of the proxy.

#### `proxy__getImplementation()`

> **Visibility:** &nbsp;&nbsp;&nbsp; `external`
>
> **Mutability:** &nbsp; `view`
>
> **Returns** &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; `(address)`

Returns the address of the implementation.

#### `proxy__getIsOssified()`

> **Visibility:** &nbsp;&nbsp;&nbsp; `external`
>
> **Mutability:** &nbsp; `view`
>
> **Returns** &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; `(bool)`

Returns whether the proxy is ossified or not.

#### `proxy__ossify()`

> **Visibility:** &nbsp; &nbsp; `external`
>
> **Modifiers:** &nbsp;&nbsp; [`onlyAdmin`](#onlyAdmin)
>
> **Emits:** &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; `AdminChanged(address previousAdmin, address newAdmin)`

Allows to transfer admin rights to zero address and prevent future upgrades of the proxy.

#### `proxy__changeAdmin(address)`

> **Visibility:** &nbsp;&nbsp;&nbsp; `external`
>
> **Modifiers:** &nbsp;&nbsp; [`onlyAdmin`](#onlyAdmin)
>
> **Arguments:**
>
> - **`newAdmin_`** - an address of the new admin. Must not be zero address.
>
> **Emits:** `AdminChanged(address previousAdmin, address newAdmin)`

Changes the admin of the proxy. Reverts with message "ERC1967: new admin is the zero address" if `newAdmin_` is zero address.

#### `proxy__upgradeTo(address)`

> **Visibility:** &nbsp;&nbsp;&nbsp; `external`
>
> **Modifiers:** &nbsp;&nbsp; [`onlyAdmin`](#onlyAdmin)
>
> **Arguments:**
>
> - **`newImplementation_`** - an address of the new implementation. Must be a contract.
>
> **Emits:** `Upgraded(address indexed implementation)`

Upgrades the implementation of the proxy. Reverts with the error "ERC1967: new implementation is not a contract" if the `newImplementation_` is not a contract.

#### `proxy__upgradeToAndCall(address,bytes memory,bool)`

> **Visibility:** &nbsp;&nbsp;&nbsp; `external`
>
> **Modifiers:** &nbsp;&nbsp; [`onlyAdmin`](#onlyAdmin)
>
> **Arguments:**
>
> - **`newImplementation_`** - an address of the new implementation. Must be a contract.
> - **`setupCalldata_`** - a data to pass into setup call after implementation upgrade.
> - **`forceCall_`** - forces make delegate call to the implementation even with empty `setupCalldata_`
>
> **Emits:** `Upgraded(address indexed implementation)`

Upgrades the implementation of the proxy with an additional setup call. Reverts with the error "ERC1967: new implementation is not a contract" if the `newImplementation_` is not a contract. If `setupCalldata_.length` equals zero setup step will be skipped, if forceCall is false.

### Modifiers

#### `onlyAdmin()`

Validates that that proxy is not ossified and that method is called by the admin of the proxy. Reverts with error `ErrorProxyIsOssified()` when called on ossified contract and with error `ErrorNotAdmin()` when called not by admin.

## Deployment Process

To reduce the gas costs for users, contracts `L1ERC20ExtendedTokensBridge`, `L2ERC20ExtendedTokensBridge`, and `ERC20Bridged` contracts use immutable variables as much as possible. But some of those variables are cross-referred. For example, `L1ERC20ExtendedTokensBridge` has reference to `L2ERC20ExtendedTokensBridge` and vice versa. As we use proxies, we can deploy proxies at first and stub the implementation with an empty contract. Then deploy actual implementations with addresses of deployed proxies and then upgrade proxies with new implementations. For stub, the following contract might be used:

```
pragma solidity ^0.8.0;
contract EmptyContract {}
```

Another option - pre-calculate the future address of the deployed contract offchain and deployed the implementation using pre-calculated addresses. But it is less fault-tolerant than the solution with an implementation stub.

# Integration Risks

As an additional link in the tokens flow chain, the Optimism protocol and bridges add points of failure. Below are the main risks of the current integration:

## Minting of uncollateralized L2 token

Such an attack might happen if an attacker obtains the right to call `L2ERC20ExtendedTokensBridge.finalizeDeposit()` directly. In such a scenario, an attacker can mint uncollaterized tokens on L2 and initiate withdrawal later.

The best way to detect such an attack is an offchain monitoring of the minting and depositing/withdrawal events. Based on such events might be tracked following stats:

- `l1ERC20TokenBridgeBalance` - a total number of locked tokens on the L1 bridge contract
- `l2TokenTotalSupply` - total number of minted L2 tokens
- `l2TokenNotWithdrawn` - total number of burned L2 tokens which aren’t withdrawn from the L1 bridge

At any time following invariant must be satisfied: `l1ERC20TokenBridgeBalance == l2TokenTotalSupply + l2TokenNotWithdrawn`.

In the case of invariant violation, Lido will have a dispute period to suspend the L1 and L2 bridges. Disabled bridges forbid the minting of L2Token and withdrawal of minted tokens till the resolution of the issue.

### Attack on fraud-proof system

Such an attack might be seeking to take control over validators or abuse the fraud-proof system to submit incorrect state root.

In such a case, the proposed incorrect block will be subject to a dispute period (1 week). Lido will be able to disable bridges till the resolution of the issue.

To decrease the risk of such an attack, Lido can run its Optimism 'full node', which will be able to initiate a transaction result challenge in case of incorrect root state submission.

Additional monitoring of the events of the `OVM_FraudVerifier` contract might help to detect incorrect behavior of the fraud-proof system, especially when valid fraud-proof was rejected.

### Attack on L1CrossDomainMessenger

According to the Optimism documentation, `L1CrossDomainMessenger`:

> The L1 Cross Domain Messenger contract sends messages from L1 to L2 and relays messages from L2 onto L1.

This contract is central in the L2 to L1 communication process since all messages from L2 that passed the challenge period are executed on behalf of this contract.

In case of a vulnerability in the `L1CrossDomainMessenger`, which allows the attacker to send arbitrary messages bypassing the dispute period, an attacker can immediately drain tokens from the L1 bridge.

Additional risk creates the upgradeability of the `L1CrossDomainMessenger`. Exist a risk of an attack with the replacement of the implementation with some malicious functionality. Such an attack might be reduced to the above vulnerability and steal all locked tokens on the L1 bridge.

To respond quickly to such an attack, Lido can set up monitoring of the Proxy contract, which will ring the alarm in case of an implementation upgrade.
