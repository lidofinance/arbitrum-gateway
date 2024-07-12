// npx hardhat deploy --network eth_sepolia

import { ethers } from 'hardhat';
import { DeployFunction } from 'hardhat-deploy/dist/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

const func: DeployFunction = async function ({
    getNamedAccounts,
    deployments,
    network,
}: HardhatRuntimeEnvironment) {
    const { deploy } = deployments;
    const { deployer } = await getNamedAccounts();

    console.log(`network: ${network.name}`);

    // deploy board manager
    const stakeHelper = await deploy('StakeHelper', {
        from: deployer,
        log: true,
        deterministicDeployment: false,
        args: [
            '0xB82381A3fBD3FaFA77B3a7bE693342618240067b',
            '0x9b72b0D75e2eb87579694E842741738d3a9C311E',
            '0xCB4619437C5Bb35d26346DeA9FeB9bD73c4f2633',
        ]
    });
};

func.id = 'StakeHelper';
func.tags = ['StakeHelper'];

export default func;
