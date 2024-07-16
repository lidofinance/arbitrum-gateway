import { assert } from "chai";
import { Wallet } from "ethers";
import { ethers } from "hardhat";
import addresses from "./addresses";
import { DeployScriptParams, OptDeploymentOptions } from "./types";
import network, { NetworkName } from "../network";
import { DeployScript, Logger } from "../deployment/DeployScript";
import {
    OssifiableProxy__factory,
    TokenRateOracle__factory,
    TokenRateNotifier__factory,
    OpStackTokenRatePusher__factory
} from "../../typechain";

interface OptDeployScriptParams extends DeployScriptParams {}
export class OracleL1DeployScript extends DeployScript {
    constructor(
        deployer: Wallet,
        tokenRateNotifierImplAddress: string,
        opStackTokenRatePusherImplAddress: string,
        logger?: Logger
    ) {
        super(deployer, logger);
        this.tokenRateNotifierImplAddress = tokenRateNotifierImplAddress;
        this.opStackTokenRatePusherImplAddress = opStackTokenRatePusherImplAddress;
    }

    public tokenRateNotifierImplAddress: string;
    public opStackTokenRatePusherImplAddress: string;
}

export class OracleL2DeployScript extends DeployScript {
    constructor(
        deployer: Wallet,
        tokenRateOracleImplAddress: string,
        tokenRateOracleProxyAddress: string,
        logger?: Logger
    ) {
        super(deployer, logger);
        this.tokenRateOracleImplAddress = tokenRateOracleImplAddress;
        this.tokenRateOracleProxyAddress = tokenRateOracleProxyAddress;
    }

    public tokenRateOracleImplAddress: string;
    public tokenRateOracleProxyAddress: string;
}

export default function deploymentOracle(
    networkName: NetworkName,
    options: OptDeploymentOptions = {}
) {
    const optAddresses = addresses(networkName, options);
    return {
        async oracleDeployScript(
            l1Token: string,
            l2GasLimitForPushingTokenRate: number,
            tokenRateOutdatedDelay: number,
            l1Params: OptDeployScriptParams,
            l2Params: OptDeployScriptParams,
        ): Promise<[OracleL1DeployScript, OracleL2DeployScript]> {

            const [
                expectedL1TokenRateNotifierImplAddress,
                expectedL1OpStackTokenRatePusherImplAddress,
            ] = await network.predictAddresses(l1Params.deployer, 2);

            const [
                expectedL2TokenRateOracleImplAddress,
                expectedL2TokenRateOracleProxyAddress
            ] = await network.predictAddresses(l2Params.deployer, 2);

            const l1DeployScript = new OracleL1DeployScript(
                l1Params.deployer,
                expectedL1TokenRateNotifierImplAddress,
                expectedL1OpStackTokenRatePusherImplAddress,
                options?.logger
            )
                .addStep({
                    factory: TokenRateNotifier__factory,
                    args: [
                        l1Params.deployer.address,
                        options?.overrides,
                    ],
                    afterDeploy: (c) =>
                        assert.equal(c.address, expectedL1TokenRateNotifierImplAddress),
                })
                .addStep({
                    factory: OpStackTokenRatePusher__factory,
                    args: [
                        optAddresses.L1CrossDomainMessenger,
                        l1Token,
                        expectedL2TokenRateOracleProxyAddress,
                        l2GasLimitForPushingTokenRate,
                        options?.overrides,
                    ],
                    afterDeploy: (c) =>
                        assert.equal(c.address, expectedL1OpStackTokenRatePusherImplAddress),
                });

            const l2DeployScript = new OracleL2DeployScript(
                l2Params.deployer,
                expectedL2TokenRateOracleImplAddress,
                expectedL2TokenRateOracleProxyAddress,
                options?.logger
            )
                .addStep({
                    factory: TokenRateOracle__factory,
                    args: [
                        optAddresses.L2CrossDomainMessenger,
                        ethers.constants.AddressZero,
                        expectedL1OpStackTokenRatePusherImplAddress,
                        tokenRateOutdatedDelay,
                        options?.overrides,
                    ],
                    afterDeploy: (c) =>
                        assert.equal(c.address, expectedL2TokenRateOracleImplAddress),
                })
                .addStep({
                    factory: OssifiableProxy__factory,
                    args: [
                        expectedL2TokenRateOracleImplAddress,
                        l2Params.admins.proxy,
                        [],
                        options?.overrides,
                    ],
                    afterDeploy: (c) =>
                        assert.equal(c.address, expectedL2TokenRateOracleProxyAddress),
                });

            return [l1DeployScript as OracleL1DeployScript, l2DeployScript as OracleL2DeployScript];
        },
    };
}
