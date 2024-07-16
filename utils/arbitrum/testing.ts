import {
  IERC20__factory,
  ERC20BridgedStub__factory,
  L1ERC20TokenGateway__factory,
  L2ERC20TokenGateway__factory,
  ArbSysStub__factory,
  ERC20Bridged__factory,
} from "../../typechain";
import contracts from "./contracts";
import addresses from "./addresses";
import deployment from "./deployment";
import testingUtils from "../testing";
import { BridgingManagement } from "../bridging-management";
import network, { NetworkName, SignerOrProvider } from "../network";
import { JsonRpcProvider } from "@ethersproject/providers";

export default function testing(networkName: NetworkName) {
  const defaultArbAddresses = addresses(networkName);
  const ethArbNetworks = network.multichain(["eth", "arb"], networkName);

  const [ethProviderForking, arbProviderForking] = ethArbNetworks.getProviders({
    forking: true,
  });

  return {
    async getAcceptanceTestSetup() {
      const gatewayContracts = await loadDeployedGateways(
        ethProviderForking,
        arbProviderForking
      );

      const { L1GatewayRouter, L2GatewayRouter } = contracts(networkName, {
        customAddresses: loadGatewayRouterAddresses(networkName),
        forking: true,
      });

      return {
        l1Provider: ethProviderForking,
        l2Provider: arbProviderForking,
        ...gatewayContracts,
        l1GatewayRouter: L1GatewayRouter,
        l2GatewayRouter: L2GatewayRouter,
      };
    },
    async getIntegrationTestSetup() {
      const hasDeployedContracts =
        testingUtils.env.USE_DEPLOYED_CONTRACTS(false);

      const gatewayContracts = hasDeployedContracts
        ? await loadDeployedGateways(ethProviderForking, arbProviderForking)
        : await deployTestGateway(
            networkName,
            ethProviderForking,
            arbProviderForking
          );

      const [l1ERC20TokenGatewayAdminAddress] =
        await BridgingManagement.getAdmins(
          gatewayContracts.l1ERC20TokenGateway
        );

      const [l2ERC20TokenGatewayAdminAddress] =
        await BridgingManagement.getAdmins(
          gatewayContracts.l2ERC20TokenGateway
        );

      const customGatewayRouterAddresses = hasDeployedContracts
        ? loadGatewayRouterAddresses(networkName)
        : undefined;

      const {
        L1GatewayRouter: l1GatewayRouter,
        L2GatewayRouter: l2GatewayRouter,
      } = contracts(networkName, {
        customAddresses: customGatewayRouterAddresses,
        forking: true,
      });

      const l1TokensHolder = hasDeployedContracts
        ? await testingUtils.impersonate(
            testingUtils.env.L1_TOKENS_HOLDER(),
            ethProviderForking
          )
        : testingUtils.accounts.deployer(ethProviderForking);

      if (hasDeployedContracts) {
        await printLoadedTestConfig(
          networkName,
          l1TokensHolder,
          gatewayContracts,
          { l1GatewayRouter, l2GatewayRouter }
        );
      }

      // if the L1 bridge admin is a contract, remove it's code to
      // make it behave as EOA
      await ethProviderForking.send("hardhat_setCode", [
        l1ERC20TokenGatewayAdminAddress,
        "0x",
      ]);

      // same for the L2 bridge admin
      await arbProviderForking.send("hardhat_setCode", [
        l2ERC20TokenGatewayAdminAddress,
        "0x",
      ]);

      const { ArbSysStub } = contracts(networkName, { forking: true });

      return {
        l1GatewayRouter,
        l2GatewayRouter,
        l1Provider: ethProviderForking,
        l2Provider: arbProviderForking,
        l1TokensHolder,
        ...gatewayContracts,
        arbSysStub: ArbSysStub,
        l1ERC20TokenGatewayAdmin: await testingUtils.impersonate(
          l1ERC20TokenGatewayAdminAddress,
          ethProviderForking
        ),
        l2ERC20TokenGatewayAdmin: await testingUtils.impersonate(
          l2ERC20TokenGatewayAdminAddress,
          arbProviderForking
        ),
      };
    },
    async getE2ETestSetup() {
      const testerPrivateKey = testingUtils.env.TESTING_PRIVATE_KEY();

      const [l1Provider, l2Provider] = ethArbNetworks.getProviders({
        forking: false,
      });

      const [l1Tester, l2Tester] = ethArbNetworks.getSigners(testerPrivateKey, {
        forking: false,
      });

      const gatewayContracts = await loadDeployedGateways(l1Tester, l2Tester);

      const {
        L1GatewayRouter: l1GatewayRouter,
        L2GatewayRouter: l2GatewayRouter,
      } = contracts(networkName, {
        customAddresses: loadGatewayRouterAddresses(networkName),
        forking: true,
      });

      await printLoadedTestConfig(networkName, l1Tester, gatewayContracts, {
        l1GatewayRouter,
        l2GatewayRouter,
      });

      return {
        l1Tester,
        l2Tester,
        l1Provider,
        l2Provider,
        l1GatewayRouter,
        l2GatewayRouter,
        ...gatewayContracts,
      };
    },
    async stubArbSysContract() {
      const deployer = testingUtils.accounts.deployer(arbProviderForking);
      const stub = await new ArbSysStub__factory(deployer).deploy();
      const stubBytecode = await arbProviderForking.send("eth_getCode", [
        stub.address,
      ]);

      await arbProviderForking.send("hardhat_setCode", [
        defaultArbAddresses.ArbSys,
        stubBytecode,
      ]);
    },
  };
}

async function deployTestGateway(
  networkName: NetworkName,
  ethProvider: JsonRpcProvider,
  arbProvider: JsonRpcProvider
) {
  const ethDeployer = testingUtils.accounts.deployer(ethProvider);
  const arbDeployer = testingUtils.accounts.deployer(arbProvider);

  const l1Token = await new ERC20BridgedStub__factory(ethDeployer).deploy(
    "Test Token",
    "TT"
  );

  const [ethDeployScript, arbDeployScript] = await deployment(
    networkName
  ).erc20TokenGatewayDeployScript(
    l1Token.address,
    {
      deployer: ethDeployer,
      admins: { proxy: ethDeployer.address, bridge: ethDeployer.address },
    },
    {
      deployer: arbDeployer,
      admins: { proxy: arbDeployer.address, bridge: arbDeployer.address },
    }
  );

  await ethDeployScript.run();
  await arbDeployScript.run();

  const l1ERC20ExtendedTokensBridgeProxyDeployStepIndex = 1;
  const l1BridgingManagement = new BridgingManagement(
    ethDeployScript.getContractAddress(l1ERC20ExtendedTokensBridgeProxyDeployStepIndex),
    ethDeployer
  );

  const l2ERC20ExtendedTokensBridgeProxyDeployStepIndex = 3;
  const l2BridgingManagement = new BridgingManagement(
    arbDeployScript.getContractAddress(l2ERC20ExtendedTokensBridgeProxyDeployStepIndex),
    arbDeployer
  );

  await l1BridgingManagement.setup({
    bridgeAdmin: ethDeployer.address,
    depositsEnabled: true,
    withdrawalsEnabled: true,
  });

  await l2BridgingManagement.setup({
    bridgeAdmin: arbDeployer.address,
    depositsEnabled: true,
    withdrawalsEnabled: true,
  });

  return {
    l1Token: l1Token.connect(ethProvider),
    ...connectGatewayContracts(
      {
        l2Token: arbDeployScript.getContractAddress(1),
        l1ERC20TokenGateway: ethDeployScript.getContractAddress(1),
        l2ERC20TokenGateway: arbDeployScript.getContractAddress(3),
      },
      ethProvider,
      arbProvider
    ),
  };
}

async function loadDeployedGateways(
  l1SignerOrProvider: SignerOrProvider,
  l2SignerOrProvider: SignerOrProvider
) {
  return {
    l1Token: IERC20__factory.connect(
      testingUtils.env.ARB_L1_TOKEN(),
      l1SignerOrProvider
    ),
    ...connectGatewayContracts(
      {
        l2Token: testingUtils.env.ARB_L2_TOKEN(),
        l1ERC20TokenGateway: testingUtils.env.ARB_L1_ERC20_TOKEN_GATEWAY(),
        l2ERC20TokenGateway: testingUtils.env.ARB_L2_ERC20_TOKEN_GATEWAY(),
      },
      l1SignerOrProvider,
      l2SignerOrProvider
    ),
  };
}

function connectGatewayContracts(
  addresses: {
    l2Token: string;
    l1ERC20TokenGateway: string;
    l2ERC20TokenGateway: string;
  },
  l1SignerOrProvider: SignerOrProvider,
  l2SignerOrProvider: SignerOrProvider
) {
  const l1ERC20TokenGateway = L1ERC20TokenGateway__factory.connect(
    addresses.l1ERC20TokenGateway,
    l1SignerOrProvider
  );
  const l2ERC20TokenGateway = L2ERC20TokenGateway__factory.connect(
    addresses.l2ERC20TokenGateway,
    l2SignerOrProvider
  );
  const l2Token = ERC20Bridged__factory.connect(
    addresses.l2Token,
    l2SignerOrProvider
  );
  return {
    l2Token,
    l1ERC20TokenGateway,
    l2ERC20TokenGateway,
  };
}

function loadGatewayRouterAddresses(networkName: NetworkName) {
  const defaultArbAddresses = addresses(networkName);
  return {
    L1GatewayRouter: testingUtils.env.ARB_L1_GATEWAY_ROUTER(
      defaultArbAddresses.L1GatewayRouter
    ),
    L2GatewayRouter: testingUtils.env.ARB_L2_GATEWAY_ROUTER(
      defaultArbAddresses.L2GatewayRouter
    ),
  };
}

async function printLoadedTestConfig(
  networkName: NetworkName,
  l1TokensHolder: any,
  gatewayContracts: any,
  gatewayRouters: any
) {
  console.log("Using the deployed contracts for integration tests");
  console.log(
    "In case of unexpected fails, please, make sure that you are forking correct Ethereum/Arbitrum networks"
  );
  console.log(`  Network Name: ${networkName}`);
  console.log(`  L1 Token: ${gatewayContracts.l1Token.address}`);
  console.log(`  L2 Token: ${gatewayContracts.l2Token.address}`);
  const l1TokensHolderAddress = await l1TokensHolder.getAddress();
  console.log(`  L1 Tokens Holder: ${l1TokensHolderAddress}`);
  const holderBalance = await gatewayContracts.l1Token.balanceOf(
    l1TokensHolderAddress
  );
  console.log(`  L1 Tokens Holder Balance: ${holderBalance.toString()}`);
  console.log(
    `  L1 ERC20 Token Gateway: ${gatewayContracts.l1ERC20TokenGateway.address}`
  );
  console.log(
    `  L2 ERC20 Token Gateway: ${gatewayContracts.l2ERC20TokenGateway.address}`
  );
  console.log(`  L1 Gateway Router: ${gatewayRouters.l1GatewayRouter.address}`);
  console.log(
    `  L2 Gateway Routery: ${gatewayRouters.l2GatewayRouter.address}`
  );
}
