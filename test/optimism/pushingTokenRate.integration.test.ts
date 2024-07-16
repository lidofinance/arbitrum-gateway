import { assert } from "chai";
import { ethers } from "hardhat";
import env from "../../utils/env";
import { wei } from "../../utils/wei";
import optimism from "../../utils/optimism";
import network from "../../utils/network";
import testing, { scenario } from "../../utils/testing";
import deploymentOracle from "../../utils/optimism/deploymentOracle";
import { getBridgeExecutorParams } from "../../utils/bridge-executor";
import { JsonRpcProvider } from "@ethersproject/providers";
import { BigNumber } from "ethers";
import {
    ERC20BridgedStub__factory,
    ERC20WrapperStub__factory,
    OptimismBridgeExecutor__factory,
    TokenRateNotifier__factory,
    TokenRateOracle__factory
} from "../../typechain";

scenario("Optimism :: Token Rate Oracle integration test", ctxFactory)

    .step("Push Token Rate", async (ctx) => {
        const {
            tokenRateNotifier,
            tokenRateOracle,
            opTokenRatePusher,
            l1CrossDomainMessenger,
            l1Token,
            l1Provider
        } = ctx;

        const tokenRate = await l1Token.stEthPerToken();

        const account = ctx.accounts.accountA;

        const tx = await tokenRateNotifier
            .connect(account.l1Signer)
            .handlePostTokenRebase(1, 2, 3, 4, 5, 6, 7);

        const messageNonce = await l1CrossDomainMessenger.messageNonce();
        const [stEthPerTokenStr, blockTimestampStr] = await tokenRateAndTimestamp(l1Provider, tokenRate);
        const l2Calldata = tokenRateOracle.interface.encodeFunctionData(
            "updateRate",
            [
                stEthPerTokenStr,
                blockTimestampStr
            ]
        );

        await assert.emits(l1CrossDomainMessenger, tx, "SentMessage", [
            tokenRateOracle.address,
            opTokenRatePusher,
            l2Calldata,
            messageNonce,
            1000,
        ]);
    })

    .step("Finalize pushing rate", async (ctx) => {
        const {
            opTokenRatePusher,
            tokenRateOracle,
            l1Token,
            l1Provider,
            l1CrossDomainMessenger
        } = ctx;

        const account = ctx.accounts.accountA;
        await l1CrossDomainMessenger
            .connect(account.l1Signer)
            .setXDomainMessageSender(opTokenRatePusher);

        const tokenRate = await l1Token.stEthPerToken();
        const [stEthPerTokenStr, blockTimestampStr] = await tokenRateAndTimestamp(l1Provider, tokenRate);

        const tx = await ctx.l2CrossDomainMessenger
            .connect(ctx.accounts.l1CrossDomainMessengerAliased)
            .relayMessage(
                1,
                opTokenRatePusher,
                tokenRateOracle.address,
                0,
                300_000,
                tokenRateOracle.interface.encodeFunctionData("updateRate", [
                    stEthPerTokenStr,
                    blockTimestampStr
                ]),
                { gasLimit: 5_000_000 }
            );

        const answer = await tokenRateOracle.latestAnswer();
        assert.equalBN(answer, tokenRate);

        const [
            ,
            tokenRateAnswer,
            ,
            updatedAt,

        ] = await tokenRateOracle.latestRoundData();

        assert.equalBN(tokenRateAnswer, tokenRate);
        assert.equalBN(updatedAt, blockTimestampStr);
    })

    .run();

async function ctxFactory() {
    const networkName = env.network("TESTING_OPT_NETWORK", "mainnet");
    const [l1Provider, l2Provider] = network
        .multichain(["eth", "opt"], networkName)
        .getProviders({ forking: true });
    const l1Deployer = testing.accounts.deployer(l1Provider);
    const l2Deployer = testing.accounts.deployer(l2Provider);

    const optContracts = optimism.contracts(networkName, { forking: true });
    const l2CrossDomainMessenger = optContracts.L2CrossDomainMessenger;
    const testingOnDeployedContracts = testing.env.USE_DEPLOYED_CONTRACTS(false);
    const optAddresses = optimism.addresses(networkName);

    const govBridgeExecutor = testingOnDeployedContracts
        ? OptimismBridgeExecutor__factory.connect(
            testing.env.OPT_GOV_BRIDGE_EXECUTOR(),
            l2Provider
        )
        : await new OptimismBridgeExecutor__factory(l2Deployer).deploy(
            optAddresses.L2CrossDomainMessenger,
            l1Deployer.address,
            ...getBridgeExecutorParams(),
            l2Deployer.address
        );

    const l1TokenRebasable = await new ERC20BridgedStub__factory(l1Deployer).deploy(
        "Test Token Rebasable",
        "TTR"
    );
    const l1Token = await new ERC20WrapperStub__factory(l1Deployer).deploy(
        l1TokenRebasable.address,
        "Test Token",
        "TT"
    );
    const [ethDeployScript, optDeployScript] = await deploymentOracle(
        networkName
    ).oracleDeployScript(
        l1Token.address,
        1000,
        86400,
        {
            deployer: l1Deployer,
            admins: {
                proxy: l1Deployer.address,
                bridge: l1Deployer.address
            },
            contractsShift: 0
        },
        {
            deployer: l2Deployer,
            admins: {
                proxy: govBridgeExecutor.address,
                bridge: govBridgeExecutor.address,
            },
            contractsShift: 0
        }
    );

    await ethDeployScript.run();
    await optDeployScript.run();

    await optimism.testing(networkName).stubL1CrossChainMessengerContract();

    const l1CrossDomainMessengerAliased = await testing.impersonate(
        testing.accounts.applyL1ToL2Alias(optContracts.L1CrossDomainMessengerStub.address),
        l2Provider
    );
    await testing.setBalance(
        await l1CrossDomainMessengerAliased.getAddress(),
        wei.toBigNumber(wei`1 ether`),
        l2Provider
    );

    const tokenRateNotifier = TokenRateNotifier__factory.connect(
        ethDeployScript.tokenRateNotifierImplAddress,
        l1Provider
    );
    await tokenRateNotifier
        .connect(l1Deployer)
        .addObserver(ethDeployScript.opStackTokenRatePusherImplAddress);
    const tokenRateOracle = TokenRateOracle__factory.connect(
        optDeployScript.tokenRateOracleProxyAddress,
        l2Provider
    );

    const accountA = testing.accounts.accountA(l1Provider, l2Provider);
    const l1CrossDomainMessenger = optContracts.L1CrossDomainMessengerStub;

    return {
        tokenRateNotifier,
        tokenRateOracle,
        opTokenRatePusher: ethDeployScript.opStackTokenRatePusherImplAddress,
        l1CrossDomainMessenger,
        l2CrossDomainMessenger,
        l1Token,
        l1Provider,
        accounts: {
            accountA,
            l1CrossDomainMessengerAliased
        }
    };
}

async function tokenRateAndTimestamp(provider: JsonRpcProvider, tokenRate: BigNumber) {
    const blockNumber = await provider.getBlockNumber();
    const blockTimestamp = (await provider.getBlock(blockNumber)).timestamp;
    const stEthPerTokenStr = ethers.utils.hexZeroPad(tokenRate.toHexString(), 12);
    const blockTimestampStr = ethers.utils.hexZeroPad(ethers.utils.hexlify(blockTimestamp), 5);
    return [stEthPerTokenStr, blockTimestampStr];
}
