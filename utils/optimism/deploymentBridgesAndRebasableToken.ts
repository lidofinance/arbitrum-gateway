import { assert } from "chai";
import { Overrides, Wallet } from "ethers";
import addresses from "./addresses";
import { CommonOptions } from "./types";
import network, { NetworkName } from "../network";
import { DeployScript, Logger } from "../deployment/DeployScript";
import {
    ERC20Bridged__factory,
    ERC20RebasableBridged__factory,
    IERC20Metadata__factory,
    L1LidoTokensBridge__factory,
    L2ERC20ExtendedTokensBridge__factory,
    OssifiableProxy__factory,
  } from "../../typechain";

interface OptL1DeployScriptParams {
  deployer: Wallet;
  admins: { proxy: string; bridge: string };
  contractsShift: number;
}

interface OptL2DeployScriptParams extends OptL1DeployScriptParams {
  l2Token?: { name?: string; symbol?: string };
  l2TokenRebasable?: { name?: string; symbol?: string };
}

interface OptDeploymentOptions extends CommonOptions {
  logger?: Logger;
  overrides?: Overrides;
}

export class BridgeL1DeployScript extends DeployScript {

    constructor(
        deployer: Wallet,
        bridgeImplAddress: string,
        bridgeProxyAddress: string,
        logger?: Logger
    ) {
        super(deployer, logger);
        this.bridgeImplAddress = bridgeImplAddress;
        this.bridgeProxyAddress = bridgeProxyAddress;
    }

    public bridgeImplAddress: string;
    public bridgeProxyAddress: string;
}

export class BridgeL2DeployScript extends DeployScript {

    constructor(
        deployer: Wallet,
        tokenImplAddress: string,
        tokenProxyAddress: string,
        tokenRebasableImplAddress: string,
        tokenRebasableProxyAddress: string,
        tokenBridgeImplAddress: string,
        tokenBridgeProxyAddress: string,
        logger?: Logger
    ) {
        super(deployer, logger);
        this.tokenImplAddress = tokenImplAddress;
        this.tokenProxyAddress = tokenProxyAddress;
        this.tokenRebasableImplAddress = tokenRebasableImplAddress;
        this.tokenRebasableProxyAddress = tokenRebasableProxyAddress;
        this.tokenBridgeImplAddress = tokenBridgeImplAddress;
        this.tokenBridgeProxyAddress = tokenBridgeProxyAddress;
      }

    public tokenImplAddress: string;
    public tokenProxyAddress: string;
    public tokenRebasableImplAddress: string;
    public tokenRebasableProxyAddress: string;
    public tokenBridgeImplAddress: string;
    public tokenBridgeProxyAddress: string;
}

/// deploy Oracle first
/// deploys from scratch wstETH on L2, stETH on L2, bridgeL1, bridgeL2
export default function deployment(
  networkName: NetworkName,
  options: OptDeploymentOptions = {}
) {
  const optAddresses = addresses(networkName, options);
  return {
    async erc20TokenBridgeDeployScript(
      l1Token: string,
      l1TokenRebasable: string,
      l2TokenRateOracle: string,
      l1Params: OptL1DeployScriptParams,
      l2Params: OptL2DeployScriptParams,
    ): Promise<[BridgeL1DeployScript, BridgeL2DeployScript]> {

      const [
        expectedL1TokenBridgeImplAddress,
        expectedL1TokenBridgeProxyAddress,
      ] = await network.predictAddresses(l1Params.deployer, l1Params.contractsShift + 2);

      const [
        expectedL2TokenImplAddress,
        expectedL2TokenProxyAddress,
        expectedL2TokenRebasableImplAddress,
        expectedL2TokenRebasableProxyAddress,
        expectedL2TokenBridgeImplAddress,
        expectedL2TokenBridgeProxyAddress,
      ] = await network.predictAddresses(l2Params.deployer, l2Params.contractsShift + 6);

      const l1DeployScript = new BridgeL1DeployScript(
        l1Params.deployer,
        expectedL1TokenBridgeImplAddress,
        expectedL1TokenBridgeProxyAddress,
        options?.logger
      )
        .addStep({
          factory: L1LidoTokensBridge__factory,
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
            L1LidoTokensBridge__factory.createInterface().encodeFunctionData(
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

      const l2DeployScript = new BridgeL2DeployScript(
        l2Params.deployer,
        expectedL2TokenImplAddress,
        expectedL2TokenProxyAddress,
        expectedL2TokenRebasableImplAddress,
        expectedL2TokenRebasableProxyAddress,
        expectedL2TokenBridgeImplAddress,
        expectedL2TokenBridgeProxyAddress,
        options?.logger
      )
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
          factory: ERC20RebasableBridged__factory,
          args: [
            l2TokenRebasableName,
            l2TokenRebasableSymbol,
            decimals,
            expectedL2TokenProxyAddress,
            l2TokenRateOracle,
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
            ERC20RebasableBridged__factory.createInterface().encodeFunctionData(
              "initialize",
              [l2TokenRebasableName, l2TokenRebasableSymbol]
            ),
            options?.overrides,
          ],
          afterDeploy: (c) =>
            assert.equal(c.address, expectedL2TokenRebasableProxyAddress),
        })
        .addStep({
          factory: L2ERC20ExtendedTokensBridge__factory,
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
            L2ERC20ExtendedTokensBridge__factory.createInterface().encodeFunctionData(
              "initialize",
              [l2Params.admins.bridge]
            ),
            options?.overrides,
          ],
        });

      return [l1DeployScript as BridgeL1DeployScript, l2DeployScript as BridgeL2DeployScript];
    },
  };
}
