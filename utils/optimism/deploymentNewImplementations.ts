import { assert } from "chai";
import { Wallet } from "ethers";
import addresses from "./addresses";
import { OptDeploymentOptions, DeployScriptParams } from "./types";
import network, { NetworkName } from "../network";
import { DeployScript, Logger } from "../deployment/DeployScript";
import {
    ERC20Bridged__factory,
    ERC20RebasableBridged__factory,
    IERC20Metadata__factory,
    L1LidoTokensBridge__factory,
    L2ERC20ExtendedTokensBridge__factory,
    OssifiableProxy__factory,
    TokenRateOracle__factory
} from "../../typechain";

interface OptL1DeployScriptParams extends DeployScriptParams {
    tokenProxyAddress: string;
    tokenRebasableProxyAddress: string;
    opStackTokenRatePusherImplAddress: string;
    tokenBridgeProxyAddress: string;
    deployer: Wallet;
    admins: {
        proxy: string;
        bridge: string
    };
    contractsShift: number;
}

interface OptL2DeployScriptParams extends DeployScriptParams {
    tokenBridgeProxyAddress: string;
    tokenProxyAddress: string;
    tokenRateOracleProxyAddress: string;
    tokenRateOracleRateOutdatedDelay: number;
    token?: {
        name?: string;
        symbol?: string
    };
    tokenRebasable?: {
        name?: string;
        symbol?: string
    };
}

export class BridgeL1DeployScript extends DeployScript {

    constructor(
        deployer: Wallet,
        bridgeImplAddress: string,
        logger?: Logger
    ) {
        super(deployer, logger);
        this.bridgeImplAddress = bridgeImplAddress;
    }

    public bridgeImplAddress: string;
}

export class BridgeL2DeployScript extends DeployScript {

    constructor(
        deployer: Wallet,
        tokenImplAddress: string,
        tokenRebasableImplAddress: string,
        tokenRebasableProxyAddress: string,
        tokenBridgeImplAddress: string,
        tokenRateOracleImplAddress: string,
        logger?: Logger
    ) {
        super(deployer, logger);
        this.tokenImplAddress = tokenImplAddress;
        this.tokenRebasableImplAddress = tokenRebasableImplAddress;
        this.tokenRebasableProxyAddress = tokenRebasableProxyAddress;
        this.tokenBridgeImplAddress = tokenBridgeImplAddress;
        this.tokenRateOracleImplAddress = tokenRateOracleImplAddress;
    }

    public tokenImplAddress: string;
    public tokenRebasableImplAddress: string;
    public tokenRebasableProxyAddress: string;
    public tokenBridgeImplAddress: string;
    public tokenRateOracleImplAddress: string;
}

/// deploys
/// - new L1Bridge Impl
/// - new L2Bridge Impl
/// - RebasableToken(stETH) Impl and Proxy (because it was never deployed before)
/// - Non-rebasable token (wstETH) new Impl with Permissions
export default function deploymentNewImplementations(
    networkName: NetworkName,
    options: OptDeploymentOptions = {}
) {
    const optAddresses = addresses(networkName, options);
    return {
        async deployScript(
            l1Params: OptL1DeployScriptParams,
            l2Params: OptL2DeployScriptParams,
        ): Promise<[BridgeL1DeployScript, BridgeL2DeployScript]> {

            const [
                expectedL1TokenBridgeImplAddress,
            ] = await network.predictAddresses(l1Params.deployer, l1Params.contractsShift + 1);

            const [
                expectedL2TokenImplAddress,
                expectedL2TokenRebasableImplAddress,
                expectedL2TokenRebasableProxyAddress,
                expectedL2TokenBridgeImplAddress,
                expectedL2TokenRateOracleImplAddress
            ] = await network.predictAddresses(l2Params.deployer, l2Params.contractsShift + 5);

            const l1DeployScript = new BridgeL1DeployScript(
                l1Params.deployer,
                expectedL1TokenBridgeImplAddress,
                options?.logger
            )
                .addStep({
                    factory: L1LidoTokensBridge__factory,
                    args: [
                        optAddresses.L1CrossDomainMessenger,
                        l2Params.tokenBridgeProxyAddress,
                        l1Params.tokenProxyAddress,
                        l1Params.tokenRebasableProxyAddress,
                        l2Params.tokenProxyAddress,
                        expectedL2TokenRebasableProxyAddress,
                        options?.overrides,
                    ],
                    afterDeploy: (c) =>
                        assert.equal(c.address, expectedL1TokenBridgeImplAddress),
                });

            const l1TokenInfo = IERC20Metadata__factory.connect(
                l1Params.tokenProxyAddress,
                l1Params.deployer
            );

            const l1TokenRebasableInfo = IERC20Metadata__factory.connect(
                l1Params.tokenRebasableProxyAddress,
                l1Params.deployer
            );
            const [decimals, l2TokenName, l2TokenSymbol, l2TokenRebasableName, l2TokenRebasableSymbol] = await Promise.all([
                l1TokenInfo.decimals(),
                l2Params.token?.name ?? l1TokenInfo.name(),
                l2Params.token?.symbol ?? l1TokenInfo.symbol(),
                l2Params.tokenRebasable?.name ?? l1TokenRebasableInfo.name(),
                l2Params.tokenRebasable?.symbol ?? l1TokenRebasableInfo.symbol(),
            ]);

            const l2DeployScript = new BridgeL2DeployScript(
                l2Params.deployer,
                expectedL2TokenImplAddress,
                expectedL2TokenRebasableImplAddress,
                expectedL2TokenRebasableProxyAddress,
                expectedL2TokenBridgeImplAddress,
                expectedL2TokenRateOracleImplAddress,
                options?.logger
            )
                .addStep({
                    factory: ERC20Bridged__factory,
                    args: [
                        l2TokenName,
                        l2TokenSymbol,
                        decimals,
                        l2Params.tokenBridgeProxyAddress,
                        options?.overrides,
                    ],
                    afterDeploy: (c) =>
                        assert.equal(c.address, expectedL2TokenImplAddress),
                })
                .addStep({
                    factory: ERC20RebasableBridged__factory,
                    args: [
                        l2TokenRebasableName,
                        l2TokenRebasableSymbol,
                        decimals,
                        l2Params.tokenProxyAddress,
                        l2Params.tokenRateOracleProxyAddress,
                        l2Params.tokenBridgeProxyAddress,
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
                        l1Params.tokenBridgeProxyAddress,
                        l1Params.tokenProxyAddress,
                        l1Params.tokenRebasableProxyAddress,
                        l2Params.tokenProxyAddress,
                        expectedL2TokenRebasableProxyAddress,
                        options?.overrides,
                    ],
                    afterDeploy: (c) =>
                        assert.equal(c.address, expectedL2TokenBridgeImplAddress),
                })
                .addStep({
                    factory: TokenRateOracle__factory,
                    args: [
                        optAddresses.L2CrossDomainMessenger,
                        l2Params.tokenBridgeProxyAddress,
                        l1Params.opStackTokenRatePusherImplAddress,
                        l2Params.tokenRateOracleRateOutdatedDelay,
                        options?.overrides,
                    ],
                    afterDeploy: (c) =>
                        assert.equal(c.address, expectedL2TokenRateOracleImplAddress),
                });

            return [l1DeployScript as BridgeL1DeployScript, l2DeployScript as BridgeL2DeployScript];
        },
    };
}
