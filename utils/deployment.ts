import chalk from "chalk";
import { Wallet } from "ethers";

import env from "./env";
import { DeployScript } from "./deployment/DeployScript";
import { BridgingManagerSetupConfig } from "./bridging-management";

interface ChainDeploymentConfig extends BridgingManagerSetupConfig {
  proxyAdmin: string;
}

interface MultiChainDeploymentConfig {
  l1Token: string;
  l1RebasableToken: string;
  l1OpStackTokenRatePusher: string;
  l2GasLimitForPushingTokenRate: number;
  tokenRateOutdatedDelay: number;
  l1TokenBridge: string;
  l2TokenBridge: string;
  l2Token: string;
  l2TokenRateOracle: string;
  govBridgeExecutor: string;
  l1: ChainDeploymentConfig;
  l2: ChainDeploymentConfig;
}

export function loadMultiChainDeploymentConfig(): MultiChainDeploymentConfig {
  return {
    l1Token: env.address("TOKEN"),
    l1RebasableToken: env.address("REBASABLE_TOKEN"),
    l1OpStackTokenRatePusher: env.address("L1_OP_STACK_TOKEN_RATE_PUSHER"),
    l2GasLimitForPushingTokenRate: Number(env.string("L2_GAS_LIMIT_FOR_PUSHING_TOKEN_RATE")),
    tokenRateOutdatedDelay: Number(env.string("TOKEN_RATE_OUTDATED_DELAY")),
    l1TokenBridge: env.address("L1_TOKEN_BRIDGE"),
    l2TokenBridge: env.address("L2_TOKEN_BRIDGE"),
    l2Token: env.address("L2_TOKEN"),
    l2TokenRateOracle: env.address("L2_TOKEN_RATE_ORACLE"),
    govBridgeExecutor: env.address("GOV_BRIDGE_EXECUTOR"),
    l1: {
      proxyAdmin: env.address("L1_PROXY_ADMIN"),
      bridgeAdmin: env.address("L1_BRIDGE_ADMIN"),
      depositsEnabled: env.bool("L1_DEPOSITS_ENABLED", false),
      withdrawalsEnabled: env.bool("L1_WITHDRAWALS_ENABLED", false),
      depositsEnablers: env.addresses("L1_DEPOSITS_ENABLERS", []),
      depositsDisablers: env.addresses("L1_DEPOSITS_DISABLERS", []),
      withdrawalsEnablers: env.addresses("L1_WITHDRAWALS_ENABLERS", []),
      withdrawalsDisablers: env.addresses("L1_WITHDRAWALS_DISABLERS", []),
    },
    l2: {
      proxyAdmin: env.address("L2_PROXY_ADMIN"),
      bridgeAdmin: env.address("L2_BRIDGE_ADMIN"),
      depositsEnabled: env.bool("L2_DEPOSITS_ENABLED", false),
      withdrawalsEnabled: env.bool("L2_WITHDRAWALS_ENABLED", false),
      depositsEnablers: env.addresses("L2_DEPOSITS_ENABLERS", []),
      depositsDisablers: env.addresses("L2_DEPOSITS_DISABLERS", []),
      withdrawalsEnablers: env.addresses("L2_WITHDRAWALS_ENABLERS", []),
      withdrawalsDisablers: env.addresses("L2_WITHDRAWALS_DISABLERS", []),
    },
  };
}

export async function printMultiChainDeploymentConfig(
  title: string,
  l1Deployer: Wallet,
  l2Deployer: Wallet,
  deploymentParams: MultiChainDeploymentConfig,
  l1DeployScript: DeployScript,
  l2DeployScript: DeployScript
) {
  const { l1Token, l1RebasableToken, l1, l2 } = deploymentParams;
  console.log(chalk.bold(`${title} :: ${chalk.underline(l1Token)} :: ${chalk.underline(l1RebasableToken)}\n`));
  console.log(chalk.bold("  · L1 Deployment Params:"));
  await printChainDeploymentConfig(l1Deployer, l1);
  console.log();
  console.log(chalk.bold("  · L1 Deployment Actions:"));
  l1DeployScript.print({ padding: 6 });

  console.log(chalk.bold("  · L2 Deployment Params:"));
  await printChainDeploymentConfig(l2Deployer, l2);
  console.log();
  console.log(chalk.bold("  · L2 Deployment Actions:"));
  l2DeployScript.print({ padding: 6 });
}

async function printChainDeploymentConfig(
  deployer: Wallet,
  params: ChainDeploymentConfig
) {
  const pad = " ".repeat(4);
  const chainId = await deployer.getChainId();
  console.log(`${pad}· Chain ID: ${chainId}`);
  console.log(`${pad}· Deployer: ${chalk.underline(deployer.address)}`);
  console.log(`${pad}· Proxy Admin: ${chalk.underline(params.proxyAdmin)}`);
  console.log(`${pad}· Bridge Admin: ${chalk.underline(params.bridgeAdmin)}`);
  console.log(`${pad}· Deposits Enabled: ${params.depositsEnabled}`);
  console.log(
    `${pad}· Withdrawals Enabled: ${JSON.stringify(params.withdrawalsEnabled)}`
  );
  console.log(
    `${pad}· Deposits Enablers: ${JSON.stringify(params.depositsEnablers)}`
  );
  console.log(
    `${pad}· Deposits Disablers: ${JSON.stringify(params.depositsDisablers)}`
  );
  console.log(
    `${pad}· Withdrawals Enablers: ${JSON.stringify(
      params.withdrawalsEnablers
    )}`
  );
  console.log(
    `${pad}· Withdrawals Disablers: ${JSON.stringify(
      params.withdrawalsDisablers
    )}`
  );
}

export default {
  loadMultiChainDeploymentConfig,
  printMultiChainDeploymentConfig,
};
