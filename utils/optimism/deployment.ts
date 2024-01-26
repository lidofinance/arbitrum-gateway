import { assert } from "chai";
import { Overrides, Wallet } from "ethers";
import {
  ERC20Bridged__factory,
  ERC20Rebasable__factory,
  IERC20Metadata__factory,
  L1ERC20TokenBridge__factory,
  L2ERC20TokenBridge__factory,
  OssifiableProxy__factory,
  TokenRateOracle,
  TokenRateOracle__factory,
  TokenRateUpdater__factory,
} from "../../typechain";

import addresses from "./addresses";
import { CommonOptions } from "./types";
import network, { NetworkName } from "../network";
import { DeployScript, Logger } from "../deployment/DeployScript";

interface OptL1DeployScriptParams {
  deployer: Wallet;
  admins: { proxy: string; bridge: string };
}

interface OptL2DeployScriptParams extends OptL1DeployScriptParams {
  l2Token?: { name?: string; symbol?: string };
  l2TokenRebasable?: { name?: string; symbol?: string };
}

interface OptDeploymentOptions extends CommonOptions {
  logger?: Logger;
  overrides?: Overrides;
}

export default function deployment(
  networkName: NetworkName,
  options: OptDeploymentOptions = {}
) {
  const optAddresses = addresses(networkName, options);
  return {
    async erc20TokenBridgeDeployScript(
      l1Token: string,
      l1TokenRebasable: string,
      l1Params: OptL1DeployScriptParams,
      l2Params: OptL2DeployScriptParams,
    ) {

      const [
        expectedL1TokenBridgeImplAddress,
        expectedL1TokenBridgeProxyAddress,
      ] = await network.predictAddresses(l1Params.deployer, 2);

      const [
        expectedL2TokenRateOracleImplAddress,
        expectedL2TokenRateUpdaterImplAddress,
        expectedL2TokenImplAddress,
        expectedL2TokenProxyAddress,
        expectedL2TokenRebasableImplAddress,
        expectedL2TokenRebasableProxyAddress,
        expectedL2TokenBridgeImplAddress,
        expectedL2TokenBridgeProxyAddress,
      ] = await network.predictAddresses(l2Params.deployer, 8);

      const l1DeployScript = new DeployScript(
        l1Params.deployer,
        options?.logger
      )
        .addStep({
          factory: L1ERC20TokenBridge__factory,
          args: [
            optAddresses.L1CrossDomainMessenger,
            expectedL2TokenBridgeProxyAddress,
            l1Token,
            l1TokenRebasable,
            expectedL2TokenProxyAddress,
            expectedL2TokenRebasableProxyAddress,
            options?.overrides,
          ],
          afterDeploy: (c) =>
            assert.equal(c.address, expectedL1TokenBridgeImplAddress),
        })
        .addStep({
          factory: OssifiableProxy__factory,
          args: [
            expectedL1TokenBridgeImplAddress,
            l1Params.admins.proxy,
            L1ERC20TokenBridge__factory.createInterface().encodeFunctionData(
              "initialize",
              [l1Params.admins.bridge]
            ),
            options?.overrides,
          ],
          afterDeploy: (c) =>
            assert.equal(c.address, expectedL1TokenBridgeProxyAddress),
        });

      const l1TokenInfo = IERC20Metadata__factory.connect(
        l1Token,
        l1Params.deployer
      );

      const l1TokenRebasableInfo = IERC20Metadata__factory.connect(
        l1TokenRebasable,
        l1Params.deployer
      );
      const [decimals, l2TokenName, l2TokenSymbol, l2TokenRebasableName, l2TokenRebasableSymbol] = await Promise.all([
        l1TokenInfo.decimals(),
        l2Params.l2Token?.name ?? l1TokenInfo.name(),
        l2Params.l2Token?.symbol ?? l1TokenInfo.symbol(),
        l2Params.l2TokenRebasable?.name ?? l1TokenRebasableInfo.name(),
        l2Params.l2TokenRebasable?.symbol ?? l1TokenRebasableInfo.symbol(),
      ]);

      const l2DeployScript = new DeployScript(
        l2Params.deployer,
        options?.logger
      )
        .addStep({
            factory: TokenRateOracle__factory,
            args: [
                expectedL2TokenBridgeProxyAddress,
                expectedL2TokenRateUpdaterImplAddress,
                86400,
                options?.overrides,
            ],
            afterDeploy: (c) =>
                assert.equal(c.address, expectedL2TokenRateOracleImplAddress),
        })

        .addStep({
            factory: TokenRateUpdater__factory,
            args: [
                expectedL2TokenRateOracleImplAddress,
                options?.overrides,
            ],
            afterDeploy: (c) =>
                assert.equal(c.address, expectedL2TokenRateUpdaterImplAddress),
        })

        .addStep({
          factory: ERC20Bridged__factory,
          args: [
            l2TokenName,
            l2TokenSymbol,
            decimals,
            expectedL2TokenBridgeProxyAddress,
            options?.overrides,
          ],
          afterDeploy: (c) =>
            assert.equal(c.address, expectedL2TokenImplAddress),
        })
        .addStep({
          factory: OssifiableProxy__factory,
          args: [
            expectedL2TokenImplAddress,
            l2Params.admins.proxy,
            ERC20Bridged__factory.createInterface().encodeFunctionData(
              "initialize",
              [l2TokenName, l2TokenSymbol]
            ),
            options?.overrides,
          ],
          afterDeploy: (c) =>
            assert.equal(c.address, expectedL2TokenProxyAddress),
        })
        .addStep({
          factory: ERC20Rebasable__factory,
          args: [
            l2TokenRebasableName,
            l2TokenRebasableSymbol,
            decimals,
            expectedL2TokenProxyAddress,
            expectedL2TokenRateOracleImplAddress,
            expectedL2TokenBridgeProxyAddress,
            options?.overrides,
          ],
          afterDeploy: (c) =>
            assert.equal(c.address, expectedL2TokenRebasableImplAddress),
        })
        .addStep({
          factory: OssifiableProxy__factory,
          args: [
            expectedL2TokenRebasableImplAddress,
            l2Params.admins.proxy,
            ERC20Rebasable__factory.createInterface().encodeFunctionData(
              "initialize",
              [l2TokenRebasableName, l2TokenRebasableSymbol]
            ),
            options?.overrides,
          ],
          afterDeploy: (c) =>
            assert.equal(c.address, expectedL2TokenRebasableProxyAddress),
        })

        .addStep({
          factory: L2ERC20TokenBridge__factory,
          args: [
            optAddresses.L2CrossDomainMessenger,
            expectedL1TokenBridgeProxyAddress,
            l1Token,
            l1TokenRebasable,
            expectedL2TokenProxyAddress,
            expectedL2TokenRebasableProxyAddress,
            options?.overrides,
          ],
          afterDeploy: (c) =>
            assert.equal(c.address, expectedL2TokenBridgeImplAddress),
        })
        .addStep({
          factory: OssifiableProxy__factory,
          args: [
            expectedL2TokenBridgeImplAddress,
            l2Params.admins.proxy,
            L2ERC20TokenBridge__factory.createInterface().encodeFunctionData(
              "initialize",
              [l2Params.admins.bridge]
            ),
            options?.overrides,
          ],
        });

      return [l1DeployScript, l2DeployScript];
    },
  };
}
