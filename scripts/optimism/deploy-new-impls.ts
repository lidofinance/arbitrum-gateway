import env from "../../utils/env";
import prompt from "../../utils/prompt";
import network from "../../utils/network";
import deployment from "../../utils/deployment";

import deploymentNewImplementations from "../../utils/optimism/deploymentNewImplementations";

async function main() {
    const networkName = env.network();
    const ethOptNetwork = network.multichain(["eth", "opt"], networkName);

    const [ethDeployer] = ethOptNetwork.getSigners(env.privateKey(), {
        forking: env.forking(),
    });
    const [, optDeployer] = ethOptNetwork.getSigners(
        env.string("OPT_DEPLOYER_PRIVATE_KEY"),
        {
            forking: env.forking(),
        }
    );

    const deploymentConfig = deployment.loadMultiChainDeploymentConfig();

    const [l1DeployScript, l2DeployScript] = await deploymentNewImplementations(
        networkName,
        { logger: console }
    )
        .deployScript(
            {
                deployer: ethDeployer,
                admins: {
                    proxy: deploymentConfig.l1.proxyAdmin,
                    bridge: ethDeployer.address
                },
                contractsShift: 0,
                tokenProxyAddress: deploymentConfig.l1Token,
                tokenRebasableProxyAddress: deploymentConfig.l1RebasableToken,
                opStackTokenRatePusherImplAddress: deploymentConfig.l1OpStackTokenRatePusher,
                tokenBridgeProxyAddress: deploymentConfig.l1TokenBridge,
            },
            {
                deployer: optDeployer,
                admins: {
                    proxy: deploymentConfig.l2.proxyAdmin,
                    bridge: optDeployer.address,
                },
                contractsShift: 0,
                tokenBridgeProxyAddress: deploymentConfig.l2TokenBridge,
                tokenProxyAddress: deploymentConfig.l2Token,
                tokenRateOracleProxyAddress: deploymentConfig.l2TokenRateOracle,
                tokenRateOracleRateOutdatedDelay: deploymentConfig.tokenRateOutdatedDelay,
            }
        );

    await deployment.printMultiChainDeploymentConfig(
        "Deploy new implementations: bridges, wstETH, stETH",
        ethDeployer,
        optDeployer,
        deploymentConfig,
        l1DeployScript,
        l2DeployScript
    );

    await prompt.proceed();

    await l1DeployScript.run();
    await l2DeployScript.run();
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
