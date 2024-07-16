# Lido's Arbitrum Gateway

The document details implementation of the bridging of the ERC20 compatible tokens[^*] between Ethereum and Arbitrum chains via Arbitrum's “Canonical Bridge”.

It's the first step of the Lido's integration into the Arbitrum protocol. The main goal of the current implementation is to be the strong foundation for the long-term goals of the Lido expansion in the Arbitrum chain. The long-run picture of the Lido's integration into L2s includes:

- Bridging of Lido's tokens from L1 to L2 chains
- Instant ETH staking on L2 chains with receiving stETH/wstETH on the corresponding L2 immediately
- Keeping UX on L2 as close as possible to the UX on Ethereum mainnet

At this point, the implementation must provide a scalable and reliable solution for Lido to bridge ERC20 compatible tokens between Arbitrum and Ethereum chain.

[^*]: The current implementation might not support the non-standard functionality of the ERC20 tokens. For example, rebasable tokens or tokens with transfers fee will work incorrectly. In case your token implements some non-typical ERC20 logic, make sure it is compatible with the gateway before usage.

## Arbitrum's Bridging Flow

Arbitrum’s “Canonical Bridge” tokens-bridging architecture consists of three types of contracts:

1. **Asset contracts**: these are the token contracts themselves, i.e., an ERC20 on L1 and it's counterpart on Arbitrum.
2. **Gateways**: Pairs of contracts (one on L1, one on L2) that implement a particular type of cross chain asset bridging.
3. **Routers**: Exactly two contracts - (one on L1, one on L2) that route each asset to its designated Gateway.

All Ethereum to Arbitrum token transfers are initiated via the `L1GatewayRouter` contract. `L1GatewayRouter` is responsible for mapping L1 token addresses to `L1Gateway`, thus acting as an L1/L2 address oracle and ensuring that each token corresponds to only one gateway. The `L1Gateway` communicates to an `L2Gateway` (typically/expectedly via retryable tickets).

Similarly, Arbitrum to Ethereum transfers are initiated via the `L2GatewayRouter` contract, which forwards calls the token's `L2Gateway`, which in turn communicates to its corresponding `L1Gateway` (typically/expectedly via sending messages to the Outbox.)

To be compatible with Arbitrum's `GatewayRouter`, both L1 and L2 gateways must conform to the `ITokenGateway` interface.

```solidity
interface ITokenGateway {
  function calculateL2TokenAddress(address l1ERC20)
    external
    view
    returns (address);

  function outboundTransfer(
    address _token,
    address _to,
    uint256 _amount,
    uint256 _maxGas,
    uint256 _gasPriceBid,
    bytes calldata _data
  ) external returns (bytes memory);

  function getOutboundCalldata(
    address _token,
    address _from,
    address _to,
    uint256 _amount,
    bytes memory _data
  ) external view returns (bytes memory);

  function finalizeInboundTransfer(
    address _token,
    address _from,
    address _to,
    uint256 _amount,
    bytes calldata _data
  ) external virtual override;
}

```

The general process of tokens bridging via Arbitrum's `GatewayRouter` consists of next steps:

### Deposits

1. A user calls `L1GatewayRouter.outboundTransfer()` (with `L1Token`'s L1 address as an argument).
2. `L1GatewayRouter` looks up `L1Token`'s gateway.
3. `L1GatewayRouter` calls `L1TokensGateway.outboundTransfer()`, forwarding the appropriate parameters.
4. `L1TokensGateway` escrows tokens and triggers `L2TokensGateway.finalizeInboundTransfer()` method on L2 (typically via a creation of a retryable ticket).
5. `finalizeInboundTransfer` mints the appropriate amount of tokens at the `L2Token` contract on L2.

![](https://i.imgur.com/A8B1xgI.png)

### Withdrawals

1. On Arbitrum, a user calls `L2GatewayRouter.outboundTransfer()`, which in turn calls `outboundTransfer` on `L2Token`'s gateway (i.e., `L2TokensGateway`).
2. This burns `L2Token` tokens and calls [`ArbSys`](https://developer.offchainlabs.com/docs/arbsys) with an encoded message to `L1TokensGateway.finalizeInboundTransfer()`, which will be eventually executed on L1.
3. After the dispute window expires and the assertion with the user's transaction is confirmed, a user can call `Outbox.executeTransaction()`, which in turn calls the encoded `L1ERC20Gateway.finalizeInboundTransfer()` message, releasing the user's tokens from the `L1TokensGateway` contract's escrow.

![](https://i.imgur.com/KOPguoa.png)

The `L1GatewayRouter` allows registering custom gateways for certain tokens via `setGateways()` method, which might be called by the OffchainLabs team manually.

The rest of the document provides a technical specification of the gateways Lido will use to transfer tokens between Arbitrum and Ethereum chains.

## Lido's Gateways Implementation

The current implementation of the gateways provides functionality to bridge the specified type of ERC20 compatible token between Ethereum and Arbitrum chains. Additionally, the bridge provides some administrative features, like the **temporary disabling of the deposits and withdrawals**. It's necessary when bridging must be disabled fast because of the malicious usage of the bridge or vulnerability in the contracts. Also, it might be helpful in the implementation upgrade process.

The technical implementation focuses on the following requirements for the contracts:

- **Scalability** - current implementation must provide the ability to be extended with new functionality in the future.
- **Simplicity** - implemented contracts must be clear, simple, and expressive for developers who will work with code in the future.
- **Gas efficiency** - implemented solution must be efficient in terms of gas costs for the end-user, but at the same time, it must not violate the previous requirement.

A high-level overview of the proposed solution might be found in the below diagram:

![](https://i.imgur.com/TPfEr29.png)

- Libraries:
  - [**`L1OutboundDataParser`**](#L1OutboundDataParser) - a helper library to parse data passed to `outboundTransfer()` of `L1ERC20TokenGateway`.
  - [**`L2OutboundDataParser`**](#L2OutboundDataParser) - a helper library to parse data passed to `outboundTransfer()` of `L2ERC20TokenGateway`.
- Abstract Contracts:
  - [_**`InterchainERC20TokenGateway`**_](#InterchainERC20TokenGateway) - an abstract contract that implements logic shared between L1 and L2 gateways.
- Contracts:
  - [**`AccessControl`**](https://github.com/OpenZeppelin/openzeppelin-contracts/blob/master/contracts/access/AccessControl.sol) - contract from the @openzeppelin package that allows children to implement role-based access.
  - [**`BridgingManager`**](#BridgingManager) - contains administrative methods to retrieve and control the state of the bridging process.
  - [**`BridgeableTokens`**](#BridgeableTokens) - contains the logic for validation of tokens used in the bridging process.
  - [**`L1CrossDomainEnabled`**](#L1CrossDomainEnabled) - helper contract for contracts performing Ethereum to Arbitrum communication process via Retryable Tickets.
  - [**`L1ERC20TokenGateway`**](#L1ERC20TokenGateway) - Ethereum's counterpart of the gateway to bridge registered ERC20 compatible tokens between Ethereum and Arbitrum chains.
  - [**`L2CrossDomainEnabled`**](#L2Messenger) - helper contract to simplify Arbitrum to Ethereum communication process
  - [**`L2ERC20TokenGateway`**](#L2ERC20TokenGateway) - Arbitrum's counterpart of the gateway to bridge registered ERC20 compatible tokens between Ethereum and Arbitrum chains
  - [**`ERC20Bridged`**](#ERC20Bridged) - an implementation of the `ERC20` token with administrative methods to mint and burn tokens.
  - [**`OssifiableProxy`**](#OssifiableProxy) - the ERC1967 proxy with extra admin functionality.

## L1OutboundDataParser

A helper library to parse data passed to `outboundTransfer()` of `L1ERC20TokenGateway`.

### Functions

#### `decode(address,bytes memory)`

> **Visibility:** &nbsp;&nbsp;&nbsp; `internal`
>
> **Mutability:** &nbsp;&nbsp;`view`
>
> **Returns:** &nbsp;&nbsp;&nbsp;&nbsp;&nbsp; `(address, uint256)`
>
> **Arguments:**
>
> - **`router_`** - an address of the Arbitrum's `L1GatewayRouter`
> - **`data_`** - bytes array encoded via the following rules:
>   - If the `msg.sender` of the method is the `router_` address, `data_` must contain the result of the function call: `abi.encode(address from, abi.encode(uint256 maxSubmissionCost, bytes emptyData))`, where `emptyData` - is an empty bytes array.
>   - In other cases, data must contain the result of the function call: `abi.encode(uint256 maxSubmissionCost, bytes emptyData)` where `emptyData` - is an empty bytes array.

Decodes value contained in `data_` bytes array and returns decoded value: `(address from, uint256 maxSubmissionCost)`. Such encoding rules are required to be compatible with the `L1GatewaysRouter`.

## L2OutboundDataParser

A helper library to parse data passed to `outboundTransfer()` of `L2ERC20TokenGateway`.

### Functions

#### decode(address,bytes memory)

> **Visibility:** &nbsp;&nbsp;&nbsp; `internal`
>
> **Mutability:** &nbsp;&nbsp;`view`
>
> **Returns** &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; `(address)`
>
> **Arguments:**
>
> - **`router_`** - an address of the Arbitrum's `L1GatewayRouter`
> - **`data_`** - bytes array encoded via the following rules:
>   - If the `msg.sender` of the method is the `router_` address, `data_` must contain the result of the function call: `abi.encode(address from, bytes emptyData)`, where `emptyData` - is an empty bytes array.
>   - In other cases, `data` must be empty bytes array.

Decodes value contained in `data_` bytes array and returns decoded value: `(address from)`. Such encoding rules are required to be compatible with the `L2GatewaysRouter`.

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

Enables the deposits if they are disabled. Reverts with the error `ErrorDepositsEnabled()` if deposits aren't enabled. Only accounts with the granted `DEPOSITS_ENABLER_ROLE` can call this method.

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

## InterchainERC20TokenGateway

**Implements:** `IInterchainERC20TokenGateway`
**Inherits:** [`BridgingManager`](#BridgingManager) [`BridgeableTokens`](#BridgeableTokens)

The contract keeps logic shared among both L1 and L2 gateways, adding the methods for bridging management: enabling and disabling withdrawals/deposits.

### Variables

The contract keeps the variables required by both L1/L2 gateways:

- **`router`** - an address of the router in the corresponding chain
- **`counterpartGateway`** - an address of the counterpart gateway used in the bridging process

All variables are declared as `immutable` to reduce transactions gas costs.

### Functions

#### `calculateL2TokenAddress(address)`

> **Visibility:** &nbsp;&nbsp;&nbsp; `external`
>
> **Mutability:** &nbsp;&nbsp;`view`
>
> **Returns** &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; `(address)`
>
> **Arguments:**
>
> - **l1Token\_** - an address of the token on the Ethereum chain

Returns an address of token, which will be minted on the Arbitrum chain, on `l1Token_` bridging. The current implementation returns the `l2Token` address when passed `l1Token_` equals to `l1Token` declared in the contract and `address(0)` in other cases.

#### `getOutboundCalldata(address,address,address,uint256,bytes memory)`

> **Visibility:** &nbsp;&nbsp;&nbsp; `public`
>
> **Mutability:** &nbsp; `view`
>
> **Returns** &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; `(bytes memory)`
>
> **Arguments:**
>
> - **`l1Token_`** - an address in the Ethereum chain of the token to bridge
> - **`from_`** - an address in the Ethereum chain of the account initiated bridging
> - **`to_`** - an address in the Ethereum chain of the recipient of the token on the corresponding chain
> - **`amount_`** - an amount of tokens to bridge
> - **`data_`** - Custom data to pass into finalizeInboundTransfer method. Unused, required to be compatible with @arbitrum/sdk package.

Returns encoded transaction data to send into the corresponding gateway to finalize the tokens bridging process. The result of this method might be used to estimate the amount of ether required to pass to the `outboundTransfer()` method call. In the current implementation returns the transaction data of `finalizeInboundTransfer(token_, from_, to_, amount_)`.

## L1CrossDomainEnabled

A helper contract for contracts performing Ethereum to Arbitrum communication process via Retryable Tickets.

### Variables

The contract declares one immutable variable **`inbox_`** - an address of the Arbitrum's [`Inbox`](https://developer.offchainlabs.com/docs/sol_contract_docs/md_docs/arb-bridge-eth/bridge/inbox) contract

### Functions

#### `sendCrossDomainMessage(address, address, bytes memory, CrossDomainMessageOptions memory)`

> **Visibility:** &nbsp;&nbsp;&nbsp; `internal`
>
> **Returns** &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; `(uint256)`
>
> **Arguments**:
>
> - **`sender_`** - an address of the sender of the message. It's also the address to credit all excess ETH from gas and call-value on the Arbitrum chain. Call-value is refunded if the retryable ticket times out or is canceled. `sender_` is also the address with the right to cancel a Retryable Ticket.
> - **`recipient_`** - an address of the recipient of the message on the Arbitrum chain
> - **`data_`** - data passed to the `recipient_` in the message
> - **`msgOptions_`** - an instance of the `CrossDomainMessageOptions` struct. The `CrossDomainMessageOptions` struct has the following properties:
>   - **`maxGas`** - gas limit for immediate L2 execution attempt (can be estimated via `NodeInterface.estimateRetryableTicket()`)
>   - **`callValue`** - call-value for L2 transaction
>   - **`gasPriceBid`** - L2 Gas price bid for immediate L2 execution attempt (queryable via standard `eth_gasPrice` RPC)
>   - **`maxSubmissionCost`** - an amount of ETH allocated to pay for the base submission fee
>
> **Emits:** `TxToL2(address indexed from, address indexed to, uint256 indexed seqNum, bytes data)`

Creates a Retryable Ticket via [`Inbox.createRetryableTicket`](https://github.com/OffchainLabs/arbitrum/blob/52356eeebc573de8c4dd571c8f1c2a6f5585f359/packages/arb-bridge-eth/contracts/bridge/Inbox.sol#L325) function using the provided arguments. Sends all passed ether with Retryable Ticket into Arbitrum chain. Reverts with error `ErrorETHValueTooLow()` if passed `msg.value` is less than `msgOptions_.callVaue + msgOptions_.maxSubmissionCost + (msgOptions_.maxGas * msgOptions_.gasPriceBid)` and with error `ErrorNoMaxSubmissionCost()` when `msgOptions_.maxSubmissionCost` is equal to 0. Returns a unique id of created Retryable Ticket.

### Modifiers

#### `onlyFromCrossDomainAccount(address crossDomainAccount_)`

Validates that transaction was initiated by the `crossDomainAccount_` address from the L2 chain. Reverts with error `ErrorUnauthorizedBridge()` if called not by Arbitrum's bridge and with error `ErrorWrongCrossDomainSender()` if the transaction was sent not from the `crossDomainAccount_` address.

## L1ERC20TokenGateway

- **Inherits**: [`InterchainERC20TokenGateway`](#InterchainERC20TokenGateway) [`L1CrossDomainEnabled`](#L1CrossDomainEnabled)
- **Implements**: `IL1TokenGateway`

Contract implements `ITokenGateway` interface and with counterpart `L2TokensGatewy` allows bridging registered ERC20 compatible tokens between Ethereum and Arbitrum chains. The contract is compatible with `L1GatewayRouter` and might be used to transfer tokens via the "canonical" Arbitrum's bridge.

Additionally, the contract provides administrative methods to temporarily disable bridging from Ethereum to Arbitrum via the `BridgingManager` contract.

### Functions

#### `outboundTransfer(address,address,uint256,uint256, uint256,bytes calldata)`

> **Visibility:** &nbsp;&nbsp;&nbsp; `external`
>
> **Mutability:** &nbsp; `payble`
>
> **Modifiers:** &nbsp;&nbsp; [`whenDepositsEnabled()`](#whenDepositsEnabled) [`onlySupportedL1Token(l1Token_)`](#onlySupportedL1Tokenaddress-l1Token_)
>
> **Returns** &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; `(bytes memory)`
>
> **Arguments:**
>
> - **l1Token\_** - an address in the Ethereum chain of the token to bridge. It must be equal to the `l1Token` address. The method will be reverted with the error `ErrorUnsupportedL1Token()` if would be called with a different address.
> - **to\_** - an address of the recipient of the token on the corresponding chain
> - **amount\_** - an amount of tokens to bridge. The user has to approve spending of the `l1Token` for the gateway or the transaction will be reverted.
> - **maxGas\_** - a gas limit for immediate L2 execution attempt (can be estimated via `_NodeInterface.estimateRetryableTicket`).
> - **gasPriceBid\_** - an L2 gas price bid for immediate L2 execution attempt (queryable via standard eth\*gasPrice RPC).
> - **data** - stores an additional data required for the transaction. Data will be decoded via the `L1OutboundDataParser.decode()` method to retrieve the `maxSubmissionCost` value and `from` address, where `from` - contains an address of the sender, and `maxSubmissionCost` - is an amount of ETH allocated to pay for the base submission fee.
>
> **Emits:** `DepositInitiated(address l1Token, address indexed from, address indexed to, uint256 indexed sequenceNumber, uint256 amount)`

Initiates the tokens bridging from the Ethereum into the Arbitrum chain. Escrows the `amount_` of `l1Token_` from the user on the address of the gateway and creates a Retryable Ticket via the `sendCrossDomainMessage()` method:

```solidity=
sendCrossDomainMessage(
    counterpartGateway, // recipient
    getOutboundCalldata(l1Token, from, to, amount, ""), // data
    CrossDomainMessageOptions({
        maxGas: maxGas,
        callValue: 0,
        gasPriceBid: gasPriceBid_,
        refundAddress: from,
        maxSubmissionCost: maxSubmissionCost
    })
)
```

Returns an encoded value of the id for created Retryable Ticket. Same value is used as `sequenceNumber` in `DepositInitiated` event.

#### `finalizeInboundTransfer(address,address,address,uint256,bytes calldata)`

> **Visibility:** &nbsp;&nbsp;&nbsp; `internal`
>
> **Modifiers:** &nbsp;&nbsp; [`whenWithdrawalsEnabled()`](#whenWithdrawalsEnabled) [`onlySupportedL1Token(l1Token_)`](#onlySupportedL1Tokenaddress-l1Token_) [`onlyFromCrossDomainAccount(counterpartGateway)`](#onlyFromCrossDomainAccountaddress-crossDomainAccount_)
>
> **Arguments:**
>
> - **`l1Token_`** - an address in the Ethereum chain of the token to withdraw
> - **`from_`** - an address of the account initiated bridging
> - **`to_`** - an address of the recipient of the tokens
> - **`amount_`** - an amount of tokens to withdraw
> - **`data_`** - unused variable, required to be compatible with `L1GatewayRouter` and `L2GatewayRouter`
>
> **Emits:** `WithdrawalFinalized(address l1Token, address indexed from, address indexed to, uint256 indexed exitNum, uint256 amount)`

This method is called to finalize the withdrawal of the tokens from the L2 chain. It transfers the `amount_` of tokens from the gateway to the `to_` address via `safeTransfer()` method.

**Note**: `exitNum` - always is equal to 0 in the `WithdrawalFinalized` event cause the current implementation doesn't support fast withdraws. To read more about fast withdrawals, see [Offchain Labs Docs](https://developer.offchainlabs.com/docs/withdrawals).

## L2CrossDomainEnabled

A helper contract to simplify Arbitrum to Ethereum communication process.

### Variables

The contract declares one immutable variable **`arbSys`** - an address of the Arbitrum's [`ArbSys`](https://developer.offchainlabs.com/docs/arbsys) contract

### Functions

#### `sendCrossDomainMessage(address,address,bytes memory)`

> **Visibility:** &nbsp;&nbsp;&nbsp; `internal`
>
> **Returns** &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; `(uint256)`
>
> **Arguments**:
>
> - **`sender_`** - an address of the sender of the message
> - **`recipient_`** - an address of the recipient of the message on the Ethereum chain
> - **`data_`** - Data passed to the `recipient_` in the message
>
> **Emits**: `event TxToL1(address indexed from, address indexed to, uint256 indexed id, bytes data)`

Sends the message to the Ethereum chain via `ArbSys.sendTxToL1()` method.

#### `applyL1ToL2Alias(address)`

> **Visibility:** &nbsp;&nbsp;&nbsp; `private`
>
> **Returns** &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; `(address)`
>
> **Arguments**:
>
> - **`l1Address_`** - an L1 address to apply aliasing

Applies the [Arbitrum's L1 -> L2 aliasing](https://developer.offchainlabs.com/docs/l1_l2_messages#address-aliasing) to the address.

### Modifiers

#### `onlyFromCrossDomainAccount(address crossDomainAccount_)`

Validates that the `msg.sender` is equal to the `crossDomainAccount_` with applied [Arbitrum's aliasing](https://developer.offchainlabs.com/docs/l1_l2_messages#address-aliasing). Reverts with the error `ErrorWrongCrossDomainSender()` if validation fails.

## L2ERC20TokenGateway

- **Inherits**: [`InterchainERC20TokenGateway`](#InterchainERC20TokenGateway) [`L2CrossDomainEnabled`](#L2CrossDomainEnabled)
- **Implements**: `IL2TokenGateway`

Contract implements `ITokenGateway` interface and with counterpart `L1ERC20TokenGateway` allows bridging registered ERC20 compatible tokens between Arbitrum and Ethereum chains. The contract is compatible with `L2GatewayRouter` and might be used to transfer tokens via the “canonical” Arbitrum’s bridge.

Additionally, the contract provides administrative methods to temporarily disable bridging from Arbitrum to Ethereum via the `BridgingManager` contract.

### Functions

#### `outboundTransfer(address,address,uint256,uint256, uint256,bytes memory)`

> **Visibility:** &nbsp;&nbsp;&nbsp; `external`
>
> **Modifiers:** &nbsp;&nbsp; [`whenWithdrawalsEnabled()`](#whenWithdrawalsEnabled) [`onlySupportedL1Token(l1Token_)`](#onlySupportedL1Tokenaddress-l1Token_)
>
> **Returns** &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; `(bytes memory)`
>
> **Arguments:**
>
> - **l1Token\_** - an address in the Ethereum chain of the token to bridge. It must be equal to the `l1Token` address. The method will be reverted with the error `ErrorUnsupportedL1Token()` if would be called with a different address.
> - **to\_** - an address of the recipient of the token on the corresponding chain
> - **amount\_** - an amount of tokens to bridge. The user has to approve spending of the `l1Token` for the gateway or the transaction will be reverted.
> - **maxGas\_** - Doesn't used
> - **gasPriceBid\_** - Doesn't used
> - **data** - stores an additional data required for transaction. Data will be decoded via `L2OutboundDataParser.decode()` method to retrieve `from` address - an address of the sender.
>
> **Emits:** `WithdrawalInitiated(address l1Token, address indexed from, address indexed to, uint256 indexed l2ToL1Id, uint256 exitNum, uint256 amount)`

Initiates the withdrawing process from the Arbitrum chain into the Ethereum chain. The method burns the `amount_` of `l2Token` on the `from_` account, sends message to the Ethereum chain via `sendCrossDomainMessage()` method:

```solidity=
sendCrossDomainMessage(
    counterpartGateway,
    getOutboundCalldata(l1Token_, from_, to_, amount_, "")
);
```

Returns encoded value of the unique id for L2-to-L1 transaction. Same value is used as `l2ToL1Id` in the `WithdrawalInitiated` event.

**Note**: `exitNum` - always is equal to 0 in the `WithdrawalInitiated` event cause the current implementation doesn't support fast withdraws. To read more about fast withdrawals, see [Offchain Labs Docs](https://developer.offchainlabs.com/docs/withdrawals).

#### `finalizeInboundTransfer(address,address,address,uint256,bytes calldata)`

> **Visibility:** &nbsp;&nbsp;&nbsp; `internal`
>
> **Modifiers:** &nbsp;&nbsp; [`whenDepositsEnabled()`](#whenDepositsEnabled) [`onlySupportedL1Token(l1Token_)`](#onlySupportedL1Tokenaddress-l1Token_) [`onlyFromCrossDomainAccount(counterpartGateway)`](#onlyFromCrossDomainAccountaddress-crossDomainAccount_1)
>
> **Arguments:**
>
> - **`l1Token_`** - an address in the Ethereum chain of the token to bridge
> - **`from_`** - an address of the account initiated bridging
> - **`to_`** - an address of the recipient of the tokens
> - **`amount_`** - an amount of tokens to bridge
> - **`data_`** - unused variable, required to be compatible with `L1GatewayRouter` and `L2GatewayRouter`
>
> **Emits:** `DepositFinalized(address indexed l1Token, address indexed from, address indexed to, uint256 amount)`

This method is called on the finalizing of the bridging from the Ethereum chain. This method mints the `amount_` of `l2Token` token to the `to_` address.

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

### Funcations

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

Returns the reference to the slot with `DynamicMetadta` struct

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

#### `increaseAllowance(address,uint256)`

> **Visibility:** &nbsp;&nbsp;&nbsp; `external`
>
> **Returns** &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; `(bool)`
>
> **Arguments:**
>
> - **`spender_`** - an address of the tokens spender
> - **`addedValue_`** - a number to increase allowance
>
> **Emits:** `Approval(address indexed owner, address indexed spender, uint256 value)`
Atomically increases the allowance granted to `spender` by the caller. Returns a `bool` value indicating whether the operation succeed.

#### `decreaseAllowance(address,uint256)`

> **Visibility:** &nbsp;&nbsp;&nbsp; `external`
>
> **Returns** &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; `(bool)`
>
> **Arguments:**
>
> - **`spender_`** - an address of the tokens spender
> - **`subtractedValue_`** - a number to decrease allowance
>
> **Emits:** `Approval(address indexed owner, address indexed spender, uint256 value)`
Atomically decreases the allowance granted to `spender` by the caller. Returns a `bool` value indicating whether the operation succeed.

## `ERC20Bridged`

**Implements:** [`IERC20Bridged`](https://github.com/lidofinance/lido-l2/blob/main/contracts/token/interfaces/IERC20Bridged.sol)
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

Extends the [`ERC1967Proxy`](https://github.com/OpenZeppelin/openzeppelin-contracts/blob/d4fb3a89f9d0a39c7ee6f2601d33ffbf30085322/contracts/proxy/ERC1967/ERC1967Proxy.sol) contract from the OpenZeppelin package and adds some admin methods. In contrast to [`UUPSUpgradableProxy`](https://github.com/OpenZeppelin/openzeppelin-contracts/blob/d4fb3a89f9d0a39c7ee6f2601d33ffbf30085322/contracts/proxy/utils/UUPSUpgradeable.sol), it doesn't increase the inheritance chain of the implementation contracts. And allows saving one extra `SLOAD` operation on every user request in contrast to [`TransparentUpgradeableProxy`](https://github.com/OpenZeppelin/openzeppelin-contracts/blob/d4fb3a89f9d0a39c7ee6f2601d33ffbf30085322/contracts/proxy/transparent/TransparentUpgradeableProxy.sol). But adding any external methods to the `ERC1967Proxy` creates the risk of selectors clashing, as described in the OpenZepplin [proxies docs](https://docs.openzeppelin.com/upgrades-plugins/1.x/proxies#transparent-proxies-and-function-clashes). To avoid the risk of clashing, the implementation upgrade process must contain a step with a search of the collisions between proxy and implementation.

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

To reduce the gas costs for users, contracts `L1ERC20TokenGateway`, `L2ERC20TokenGateway`, and `L2TokensToken` use immutable variables as much as possible. But some of those variables are cross-referred. For example, `L1ERC20TokenGateway` has reference to `L2ERC20TokenGateway` and vice versa. As we use proxies, we can deploy proxies at first and stub the implementation with an empty contract. Then deploy actual implementations with addresses of deployed proxies and then upgrade proxies with new implementations. For stub might be used next contract:

```
pragma solidity ^0.8.0;
contract EmptyContract {}
```

Another option - pre-calculate the future address of the deployed contract offchain and deployed the implementation using pre-calculated addresses. But it is less fault-tolerant than the solution with an implementation stub.

## Integration Risks

As an additional link in the tokens flow chain, the Arbitrum and gateways possibly add points of failure. Below are the main risks of the current integration:

### Minting of uncollateralized `L2Token`

Such an attack might happen if an attacker obtains the right to call `L2ERC20TokenGateway.finalizeOutboundTransfer()` directly to mint uncollateralized L2Token. In such a scenario, an attacker can mint tokens on L2 and initiate withdrawal of those tokens.

The best way to detect such an attack is an offchain monitoring of the minting and depositing/withdrawal events. Based on such events might be tracked following stats:

- `l1GatewayBalance` - a total number of locked tokens on the L1 gateway
- `l2TokenTotalSupply` - total number of minted L2 tokens
- `l2TokenNotWithdrawn` - total number of burned L2 tokens which aren't withdrawn from the L1 gateway

At any time following invariant must be sutisfied: `l1GatewayBalance == l2TokenTotalSupply + l2TokenNotWithdrawn`.

In the case of invariant violation, Lido will have a dispute period to suspend L1 and L2 gateways. Paused gateways forbid minting of L2Token and withdrawing of minted tokens till the resolution of the issue.

### Attack on fraud-proof system

Such an attack might be seeking to take control over validators or abuse the fraud-proof system to submit incorrect state root. In such a case, the proposed incorrect block will be subject to a dispute period. Lido may run its validator with a "watchtower" strategy, which will ring the alarm when an invalid block is proposed. When it happens, the gateway must be suspended to protect users from potential funds lost till the resolution of the issue.

### Attack on `L1GatewaysRouter`

Theoretical situation, when an attacker takes control over `L1GatewaysRouter` and replaces an address of the gateway responsible for token bridging on some malicious contract. It potentially allows to steal the tokens transferred after the gateway substitution. To react to such an attack fastly, Lido has to monitor the `GatewaySet` event with the address of the Lido token. In case such an event was emitted, the Offchain Labs Team must be reached out to investigate the details and fix an issue asap to minimize the damage.
