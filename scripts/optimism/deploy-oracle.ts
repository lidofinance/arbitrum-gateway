import env from "../../utils/env";
import prompt from "../../utils/prompt";
import network from "../../utils/network";
import optimism from "../../utils/optimism";
import deployment from "../../utils/deployment";
import { TokenRateNotifier__factory } from "../../typechain";

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

    const [l1DeployScript, l2DeployScript] = await optimism
        .deploymentOracle(networkName, { logger: console })
        .oracleDeployScript(
            deploymentConfig.l1Token,
            deploymentConfig.l2GasLimitForPushingTokenRate,
            deploymentConfig.tokenRateOutdatedDelay,
            {
                deployer: ethDeployer,
                admins: {
                    proxy: deploymentConfig.l1.proxyAdmin,
                    bridge: ethDeployer.address,
                },
                contractsShift: 0
            },
            {
                deployer: optDeployer,
                admins: {
                    proxy: deploymentConfig.l2.proxyAdmin,
                    bridge: optDeployer.address,
                },
                contractsShift: 0
            }
        );

    await deployment.printMultiChainDeploymentConfig(
        "Deploy Token Rate Oracle",
        ethDeployer,
        optDeployer,
        deploymentConfig,
        l1DeployScript,
        l2DeployScript
    );

    await prompt.proceed();

    await l1DeployScript.run();
    await l2DeployScript.run();

    /// setup by adding observer
    const tokenRateNotifier = TokenRateNotifier__factory.connect(
        l1DeployScript.tokenRateNotifierImplAddress,
        ethDeployer
    );
    await tokenRateNotifier
        .connect(ethDeployer)
        .addObserver(l1DeployScript.opStackTokenRatePusherImplAddress);
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
