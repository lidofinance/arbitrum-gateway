# Lido L2

This project contains the implementations of the L2 ERC20 token bridges for Arbitrum and Optimism chains. The current solution allows transferring ERC20 tokens between L1 and L2 chains.

To retrieve more detailed info about the bridging process, see the specifications for certain chains:

- [Lido's Arbitrum Gateway](https://github.com/lidofinance/lido-l2/blob/main/contracts/arbitrum/README.md).
- [Lido's Optimism Bridge](https://github.com/lidofinance/lido-l2/blob/main/contracts/optimism/README.md).
- [wstETH Bridging Guide](https://docs.lido.fi/token-guides/wsteth-bridging-guide/#r-5-bridging-l1-lido-dao-decisions)

## Project setup

1. Clone the repo:

```bash
git clone git@github.com:lidofinance/lido-l2.git
cd ./lido-l2
```

2. Install dependencies:

```bash
npm install
```

3. Compile the contracts:

```bash
npm run compile
```

## Configure ENV variables

The simplest way to create `.env` file is via cloning the `.env.example` file:

```bash
cp .env.example .env
```

Fill the newly created `.env` file with the required variables. See the [Project Configuration](#Project-Configuration) section for the complete list of configuration options.

## Bridge deployment

The configuration of the deployment scripts happens via the ENV variables. The following variables are required:

- [`TOKEN`](#TOKEN) - address of the non-rebasable token to deploy a new bridge on the Ethereum chain.
- [`REBASABLE_TOKEN`] (#REBASABLE_TOKEN) - address of the rebasable token to deploy new bridge on the Ethereum chain.
- [`L1_OP_STACK_TOKEN_RATE_PUSHER`](#L1_OP_STACK_TOKEN_RATE_PUSHER) - address of token rate pusher. Required to config TokenRateOracle.
- [`L2_GAS_LIMIT_FOR_PUSHING_TOKEN_RATE`](#L2_GAS_LIMIT_FOR_PUSHING_TOKEN_RATE) - gas limit required to complete pushing token rate on L2.This value was calculated by formula: l2GasLimit = (gas cost of L2Bridge.finalizeDeposit() + OptimismPortal.minimumGasLimit(depositData.length)) * 1.5
- [`TOKEN_RATE_OUTDATED_DELAY`](#TOKEN_RATE_OUTDATED_DELAY) - a time period when token rate can be considered outdated. Default is 86400 (24 hours).
- [`L1_TOKEN_BRIDGE`](#L1_TOKEN_BRIDGE) - address of L1 token bridge.
- [`L2_TOKEN_BRIDGE`](#L2_TOKEN_BRIDGE) - address of L2 token bridge.
- [`L2_TOKEN`](#L2_TOKEN) - address of the non-rebasable token on L2.
- [`L2_TOKEN_RATE_ORACLE`](#L2_TOKEN_RATE_ORACLE) - address of token rate oracle on L2.
- [`GOV_BRIDGE_EXECUTOR`](#GOV_BRIDGE_EXECUTOR) - address of bridge executor.
- [`NETWORK`](#NETWORK) - name of the network environments used by deployment scripts. Allowed values: `mainnet`, `sepolia`.
- [`FORKING`](#FORKING) - run deployment in the forking network instead of real ones
- [`ETH_DEPLOYER_PRIVATE_KEY`](#ETH_DEPLOYER_PRIVATE_KEY) - The private key of the deployer account in the Ethereum network is used during the deployment process.
- [`ARB_DEPLOYER_PRIVATE_KEY`](#ARB_DEPLOYER_PRIVATE_KEY) - The private key of the deployer account in the Arbitrum network is used during the deployment process.
- [`OPT_DEPLOYER_PRIVATE_KEY`](#ARB_DEPLOYER_PRIVATE_KEY) - The private key of the deployer account in the Optimism network is used during the deployment process.
- [`L1_PROXY_ADMIN`](#L1_PROXY_ADMIN) - The address to grant admin rights of the `OssifiableProxy` on the L1 bridge
- [`L1_BRIDGE_ADMIN`](#L1_BRIDGE_ADMIN) - Address to grant the `DEFAULT_ADMIN_ROLE` on the L1 bridge
- [`L2_PROXY_ADMIN`](#L2_PROXY_ADMIN) - The address to grant admin rights of the `OssifiableProxy` on the L2 bridge
- [`L2_BRIDGE_ADMIN`](#L2_BRIDGE_ADMIN) - Address to grant the `DEFAULT_ADMIN_ROLE` on the L2 bridge

The following ENV variables are optional and might be used to make an additional setup of the bridge after the deployment:

- [`L1_DEPOSITS_ENABLED`](#L1_DEPOSITS_ENABLED) - whether the deposits are enabled on the L1 after the deployment. By default, deposits are disabled.
- [`L1_WITHDRAWALS_ENABLED`](#L1_WITHDRAWALS_ENABLED) - whether the withdrawals are enabled on the L1 after the deployment. By default, withdrawals are disabled.
- [`L1_DEPOSITS_ENABLERS`](#L1_DEPOSITS_ENABLERS) - array of addresses to grant `DEPOSITS_ENABLER_ROLE` on the L1 bridge.
- [`L1_DEPOSITS_DISABLERS`](#L1_DEPOSITS_DISABLERS) - array of addresses to grant `DEPOSITS_DISABLER_ROLE` on the L1 bridge.
- [`L1_WITHDRAWALS_ENABLERS`](#L1_WITHDRAWALS_ENABLES) - array of addresses to grant `WITHDRAWALS_ENABLER_ROLE` on the L1 bridge.
- [`L1_WITHDRAWALS_DISABLERS`](#L1_WITHDRAWALS_DISABLERS) - array of addresses to grant `WITHDRAWALS_DISABLER_ROLE` on the L1 bridge.
- [`L2_DEPOSITS_ENABLED`](#L2_DEPOSITS_ENABLED) - whether the deposits are enabled on the L2 after the deployment. By default, deposits are disabled.
- [`L2_WITHDRAWALS_ENABLED`](#L2_WITHDRAWALS_ENABLED) - whether the withdrawals are enabled on the L2 after the deployment. By default, deposits are disabled.
- [`L2_DEPOSITS_ENABLERS`](#L2_DEPOSITS_ENABLERS) - array of addresses to grant `DEPOSITS_ENABLER_ROLE` on the L2 bridge.
- [`L2_DEPOSITS_DISABLERS`](#L2_DEPOSITS_DISABLERS) - array of addresses to grant `DEPOSITS_DISABLER_ROLE` on the L2 bridge.
- [`L2_WITHDRAWALS_ENABLERS`](#L2_WITHDRAWALS_ENABLES) - array of addresses to grant `WITHDRAWALS_ENABLER_ROLE` on the L2 bridge.
- [`L2_WITHDRAWALS_DISABLERS`](#L2_WITHDRAWALS_DISABLERS) - array of addresses to grant `WITHDRAWALS_DISABLER_ROLE` on the L2 bridge.

### Deploying Arbitrum gateway

To run the deployment of the ERC20 token gateway for the Ethereum <-> Arbitrum chains use the following command:

```bash
npm run arbitrum:deploy
```

### Deploying Optimism bridge

To run the deployment of the ERC20 token gateway for the Ethereum <-> Optimism chains use the following command:

```bash
npm run optimism:deploy
```

## Tests running

### Unit tests

To run unit tests use one of the following commands:

```bash

# Run tests for both Arbitrum and Optimism bridges
npm run test:unit

# Run tests only for Arbitrum gateway
npm run arbitrum:test:unit

# Run tests only for Optimism bridge
npm run optimism:test:unit
```

### Integration tests

Before running integration tests, run the hardhat forked nodes in the standalone tabs corresponding to `TESTING_ARB_NETWORK` \ `TESTING_OPT_NETWORK` env variable or if it's not set use `mainnet` network. Example of the commands for the `mainnet` network:

```bash
# Required to run both Arbitrum and Optimism integraton tests
npm run fork:eth:mainnet

# Required to run Optimism integration tests
npm run fork:opt:mainnet

# Required to run Arbitrum integration tests
npm run fork:arb:mainnet
```

The integration tests might be run via the following commands:

```bash
# Run integration tests for both Arbitrum and Optimism bridges
npm run test:integration

# Run integration tests for Arbitrum bridge
npm run arbitrum:test:integration

# Run integration tests for Optimism bridge
npm run optimism:test:integration
```

Additionally, tests might be run on the deployed contracts. To do it, set the following variables values in the `.env` file:

```bash
# Activates testing on already deployed contracts
TESTING_USE_DEPLOYED_CONTRACTS=true
# Address of the account which has tokens to test
TESTING_L1_TOKENS_HOLDER=

# Addresses of the Arbitrum gateway
TESTING_ARB_NETWORK=
TESTING_ARB_L1_TOKEN=
TESTING_ARB_L2_TOKEN=
TESTING_ARB_L1_ERC20_TOKEN_GATEWAY=
TESTING_ARB_L2_ERC20_TOKEN_GATEWAY=

# Below addresses are not required when the gateway uses the default Arbitrum router
TESTING_ARB_L1_GATEWAY_ROUTER=
TESTING_ARB_L2_GATEWAY_ROUTER=

# Addresses of the Optimism bridge
TESTING_OPT_NETWORK=
TESTING_OPT_L1_TOKEN=
TESTING_OPT_L2_TOKEN=
TESTING_OPT_L1_ERC20_TOKEN_BRIDGE=
TESTING_OPT_L2_ERC20_TOKEN_BRIDGE=
```

### E2E tests

E2E tests run on the real contracts deployed on the testnet networks. To run such tests next env variables must be set in the `.env` file.

[`TESTING_PRIVATE_KEY`](#TESTING_PRIVATE_KEY)
[`TESTING_OPT_LDO_HOLDER_PRIVATE_KEY`](#TESTING_OPT_LDO_HOLDER_PRIVATE_KEY)
[`TESTING_ARB_LDO_HOLDER_PRIVATE_KEY`](#TESTING_ARB_LDO_HOLDER_PRIVATE_KEY)

To run E2E tests use the following commands:

```bash
# Run E2E tests for both Arbitrum and Optimism bridges
npm run test:e2e

# Run E2E tests for Arbitrum bridge
npm run arbitrum:test:e2e

# Run E2E tests for Optimism bridge
npm run optimism:test:e2e
```

Additionally, tests might be run on the deployed contracts. To do it, set the following variables values in the `.env` file:

```bash
# private key of the tester. It must have tokens for testing
TESTING_PRIVATE_KEY=

# Addresses of the Arbitrum gateway
TESTING_ARB_NETWORK=
TESTING_ARB_L1_TOKEN=
TESTING_ARB_L2_TOKEN=
TESTING_ARB_L1_ERC20_TOKEN_GATEWAY=
TESTING_ARB_L2_ERC20_TOKEN_GATEWAY=

# Below addresses are not required when the gateway uses the default Arbitrum router
TESTING_ARB_L1_GATEWAY_ROUTER=
TESTING_ARB_L2_GATEWAY_ROUTER=

# Addresses of the Optimism bridge
TESTING_OPT_NETWORK=
TESTING_OPT_L1_TOKEN=
TESTING_OPT_L2_TOKEN=
TESTING_OPT_L1_ERC20_TOKEN_BRIDGE=
TESTING_OPT_L2_ERC20_TOKEN_BRIDGE=
```

### Acceptance tests

The acceptance tests might be run after the deployment to validate that the bridge was deployed with the correct parameters.

The following ENV variables must be set before the tests running:

```bash
# Addresses of the Arbitrum gateway
TESTING_ARB_L1_TOKEN=
TESTING_ARB_L2_TOKEN=
TESTING_ARB_L1_ERC20_TOKEN_GATEWAY=
TESTING_ARB_L2_ERC20_TOKEN_GATEWAY=

# Below addresses are not required when the gateway uses the default Arbitrum router
TESTING_ARB_L1_GATEWAY_ROUTER=
TESTING_ARB_L2_GATEWAY_ROUTER=

# Addresses of the Optimism bridge
TESTING_OPT_L1_TOKEN=
TESTING_OPT_L2_TOKEN=
TESTING_OPT_L1_ERC20_TOKEN_BRIDGE=
TESTING_OPT_L2_ERC20_TOKEN_BRIDGE=
```

To run the acceptance tests, use the following commands:

```bash
# Optimism bridge
npm run optimism:test:acceptance

# Arbitrum bridge
npm run arbitrum:test:acceptance
```

## Code Coverage

To run coverage measurement for unit tests:

```bash
npm run coverage
```

## Project Configuration

The configuration of the project happens via set of ENV variables. The full list of the configured properties might be split in the following groups:

### RPCs

#### `RPC_URL_ETH_MAINNET`

Address of the RPC node for **Mainnet** Ethereum network.

#### `RPC_ETH_GOERLI`

Address of the RPC node for **Goerli** Ethereum network.

#### `RPC_ARB_MAINNET`

> **Warning**
>
> Please, don't use the default value for production deployments! The default RPC node might not be available or fail suddenly during the request.

Address of the RPC node for **Mainnet** Arbitrum network.

> Default value: `https://arb1.arbitrum.io/rpc`

#### `RPC_ARB_GOERLI`

Address of the RPC node for **Goerli** Arbitrum network.

> Default value: `https://goerli-rollup.arbitrum.io/rpc`

#### `RPC_OPT_GOERLI`

Address of the RPC node for **Goerli** Optimism network.

> Default value: `https://goerli-rollup.arbitrum.io/rpc`

#### `RPC_OPT_MAINNET`

> **Warning**
>
> Please, don't use the default value for production deployments! The default RPC node might not be available or fail suddenly during the request.

Address of the RPC node for **Mainnet** Optimism network.

> Default value: `https://mainnet.optimism.io`


### Etherscan

Below variables are required for successfull verification of the contracts on block explorer for certain networks.

#### `ETHERSCAN_API_KEY_ETH`

API key from the [Etherscan](https://etherscan.io/) block explorer. See details here: https://info.etherscan.com/api-keys/

#### `ETHERSCAN_API_KEY_ARB`

API key from the [Arbiscan](https://arbiscan.io/) block explorer.

#### `ETHERSCAN_API_KEY_OPT`

API key from the [Optimistic Ethereum](https://optimistic.etherscan.io/) block explorer.

### Bridge/Gateway Deployment

Below variables used in the Arbitrum/Optimism bridge deployment process.

#### `TOKEN`

Address of the existing non-rebasable token to deploy a new bridge for on the Ethereum chain.

#### `REBASABLE_TOKEN`

Address of the existing rebasable token to deploy new bridge for on the Ethereum chain.

#### `NETWORK`

> Default value: `mainnet`

Name of the network environments used by deployment scripts. Might be one of: `mainnet`, `sepolia`.

#### `FORKING`

Run deployment in the forking network instead of public ones

> Default value: `true`

#### `ETH_DEPLOYER_PRIVATE_KEY`

The private key of the deployer account in the Ethereum network is used during the deployment process.

#### `ARB_DEPLOYER_PRIVATE_KEY`

The private key of the deployer account in the Arbitrum network is used during the deployment process.

#### `OPT_DEPLOYER_PRIVATE_KEY`

The private key of the deployer account in the Optimism network is used during the deployment process.

#### `L1_PROXY_ADMIN`

The address assigned as admin of the `OssifiableProxy` contract for `L1ERC20Bridge` / `L1ERC20Gateway`.

#### `L1_BRIDGE_ADMIN`

The address granted the `DEFAULT_ADMIN_ROLE` for `L1ERC20Bridge` / `L1ERC20Gateway`.

#### `L1_DEPOSITS_ENABLED`

> Default value: `false`

Whether the deposits enabled on the L1 after the deployment

#### `L1_WITHDRAWALS_ENABLED`

> Default value: `false`

Whether the deposits enabled on the L1 after the deployment

#### `L1_DEPOSITS_ENABLERS`

> Default value: `[]`

The array of addresses to grant `DEPOSITS_ENABLER_ROLE` on L1 bridge/gateway. The value must be in the form of JSON array of strings. For example:
`["0x00000000219ab540356cbb839cbe05303d7705fa","0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2"]`

#### `L1_DEPOSITS_DISABLERS`

> Default value: `[]`

The array of addresses to grant `DEPOSITS_DISABLER_ROLE` on L1 bridge/gateway. The value must be in the form of JSON array of strings. For example:
`["0x00000000219ab540356cbb839cbe05303d7705fa","0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2"]`

#### `L1_WITHDRAWALS_ENABLERS`

> Default value: `[]`

The array of addresses to grant `WITHDRAWALS_ENABLER_ROLE` on L1 bridge/gateway. The value must be in the form of JSON array of strings. For example:
`["0x00000000219ab540356cbb839cbe05303d7705fa","0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2"]`

#### `L1_WITHDRAWALS_DISABLERS`

> Default value: `[]`

The array of addresses to grant `WITHDRAWALS_DISABLER_ROLE`. The value must be in the form of JSON array of strings. For example:
`["0x00000000219ab540356cbb839cbe05303d7705fa","0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2"]`

#### `L2_PROXY_ADMIN`

The address assigned as admin of the `OssifiableProxy` contract for `L2ERC20Bridge` / `L2ERC20Gateway` and ERC20Bridged.

#### `L2_BRIDGE_ADMIN`

The address granted the `DEFAULT_ADMIN_ROLE` for `L2ERC20Bridge` / `L2ERC20Gateway`.

#### `L2_DEPOSITS_ENABLED`

> Default value: `false`

Whether the deposits enabled on the L2 after the deployment

#### `L2_WITHDRAWALS_ENABLED`

> Default value: `false`

Whether the deposits enabled on the L2 after the deployment

#### `L2_DEPOSITS_ENABLERS`

> Default value: `[]`

The array of addresses to grant `DEPOSITS_ENABLER_ROLE` on L2 bridge/gateway. The value must be in the form of JSON array of strings. For example:
`["0x00000000219ab540356cbb839cbe05303d7705fa","0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2"]`

#### `L2_DEPOSITS_DISABLERS`

> Default value: `[]`

The array of addresses to grant `DEPOSITS_DISABLER_ROLE` on L2 bridge/gateway. The value must be in the form of JSON array of strings. For example:
`["0x00000000219ab540356cbb839cbe05303d7705fa","0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2"]`

#### `L2_WITHDRAWALS_ENABLERS`

> Default value: `[]`

The array of addresses to grant `WITHDRAWALS_ENABLER_ROLE` on L2 bridge/gateway. The value must be in the form of JSON array of strings. For example:
`["0x00000000219ab540356cbb839cbe05303d7705fa","0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2"]`

#### `L2_WITHDRAWALS_DISABLERS`

> Default value: `[]`

The array of addresses to grant `WITHDRAWALS_DISABLER_ROLE` on L2 bridge/gateway. The value must be in the form of JSON array of strings. For example:
`["0x00000000219ab540356cbb839cbe05303d7705fa","0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2"]`

### Acceptance Integration & E2E Testing

The following variables are used in the process of the Integration & E2E testing.

#### `TESTING_ARB_NETWORK`

Name of the network environments used for Arbitrum Integration & E2E testing. Might be one of: `mainnet`, `sepolia`.

#### `TESTING_ARB_L1_TOKEN`

Address of the token to use in the Acceptance Integration & E2E (when `TESTING_USE_DEPLOYED_CONTRACTS` is set to true) testing of the bridging between Ethereum and Arbitrum networks.

> Default value: `0x7AEE39c46f20135114e85A03C02aB4FE73fB8127`

#### `TESTING_ARB_L2_TOKEN`

Address of the token minted on L2 in the Acceptance Integration & E2E (when `TESTING_USE_DEPLOYED_CONTRACTS` is set to true) testing of the bridging between Ethereum and Arbitrum networks.

> Default value: `0x775ede8029C117effce283b3391E420EacF3c85F`

#### `TESTING_ARB_L1_ERC20_TOKEN_GATEWAY`

Address of the L1 ERC20 token gateway used in the Acceptance Integration & E2E (when `TESTING_USE_DEPLOYED_CONTRACTS` is set to true) testing of the bridging between Ethereum and Arbitrum networks.

> Default value: `0x0A7e12b563Ba623646a31a09F0182e8aD45D6cfD`

#### `TESTING_ARB_L2_ERC20_TOKEN_GATEWAY`

Address of the L2 ERC20 token gateway used in the Acceptance Integration & E2E (when `TESTING_USE_DEPLOYED_CONTRACTS` is set to true) testing of the bridging between Ethereum and Arbitrum networks.

> Default value: `0x8c269989D839eE9DaEe64D57C8c41404DF87F722`

#### `TESTING_ARB_L1_GATEWAY_ROUTER`

Address of the L1 gateway router used in the Acceptance Integration & E2E (when `TESTING_USE_DEPLOYED_CONTRACTS` is set to true) testing of the bridging between Ethereum and Arbitrum networks. If not set, will be used default Arbitrum's L1 Gateway Router

> Default value: `0xa2a8F940752aDc4A3278B63B96d56D72D2b075B1`

#### `TESTING_ARB_L2_GATEWAY_ROUTER`

Address of the L2 gateway router used in the Acceptance Integration & E2E (when `TESTING_USE_DEPLOYED_CONTRACTS` is set to true) testing of the bridging between Ethereum and Arbitrum networks. If not set, will be used default Arbitrum's L2 Gateway Router

> Default value: `0x57f54f87C44d816f60b92864e23b8c0897D4d81D`

#### `TESTING_OPT_NETWORK`

Name of the network environments used for Optimism Integration & E2E testing. Might be one of: `mainnet`, `sepolia`.

#### `TESTING_OPT_L1_TOKEN`

Address of the token to use in the Acceptance Integration & E2E (when `TESTING_USE_DEPLOYED_CONTRACTS` is set to true) testing of the bridging between Ethereum and Optimism networks.

> Default value: `0xaF8a2F0aE374b03376155BF745A3421Dac711C12`

#### `TESTING_OPT_L2_TOKEN`

Address of the token minted on L2 in the Acceptance Integration & E2E (when `TESTING_USE_DEPLOYED_CONTRACTS` is set to true) testing of the bridging between Ethereum and Optimism networks.

> Default value: `0xAED5F9aaF167923D34174b8E636aaF040A11f6F7`

#### `TESTING_OPT_L1_ERC20_TOKEN_BRIDGE`

Address of the L1 ERC20 token bridge used in the Acceptance Integration & E2E (when `TESTING_USE_DEPLOYED_CONTRACTS` is set to true) testing of the bridging between Ethereum and Optimism networks.

> Default value: `0x243b661276670bD17399C488E7287ea4D416115b`

#### `TESTING_OPT_L2_ERC20_TOKEN_BRIDGE`

Address of the L2 ERC20 token bridge used in the Acceptance Integration & E2E (when `TESTING_USE_DEPLOYED_CONTRACTS` is set to true) testing of the bridging between Ethereum and Optimism networks.

> Default value: `0x447CD1794d209Ac4E6B4097B34658bc00C4d0a51`

### Integration Testing

#### `TESTING_USE_DEPLOYED_CONTRACTS`

When set to `true` integration tests will use addresses of deployed contracts set in corresponding variables in the `.env` file. In other cases, bridges will be deployed on fork nodes from scratch.

#### `TESTING_L1_TOKENS_HOLDER`

When `TESTING_USE_DEPLOYED_CONTRACTS` is set to true, this address will be used as the holder of the tokens, bridged between L1 and L2.

#### `TESTING_ARB_GOV_BRIDGE_EXECUTOR`

Address of the deployed Governance Bridge Executor in the Arbitrum network. If set, this contract will be used for integration tests of Governance Bridge.

#### `TESTING_OPT_GOV_BRIDGE_EXECUTOR`

Address of the deployed Governance Bridge Executor in the Optimism network. If set, this contract will be used for integration tests of Governance Bridge.

### E2E Testing

#### `TESTING_PRIVATE_KEY`

The private key from the address which holds:

- Goerli and Arbitrum/Optimistic Goerli Ether to launch Arbitrum/Optimism E2E tests

The test Ether might be retrived via [Paradigm Faucet](https://faucet.paradigm.xyz/).

#### `TESTING_OPT_LDO_HOLDER_PRIVATE_KEY`

The private key from the address which holds 50+% TLDO

#### `TESTING_ARB_LDO_HOLDER_PRIVATE_KEY`

The private key from the address which holds 50+% TLDO
