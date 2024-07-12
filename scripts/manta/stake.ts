// npx hardhat run scripts/manta/stake.ts --network eth_sepolia
import { ethers, getNamedAccounts, config } from 'hardhat'
import { CrossChainMessenger, MessageDirection, MessageStatus } from '@eth-optimism/sdk'
import { address, abi } from '../../deployments/eth_sepolia/StakeHelper.json'
import { StakeHelper } from '../../typechain'

async function run() {
    const l1Provider = new ethers.providers.JsonRpcProvider('https://rpc.ankr.com/eth_sepolia')
    const l2Provider = new ethers.providers.JsonRpcProvider('https://rpc.ankr.com/eth_sepolia')

    const crossDomainMessenger = new CrossChainMessenger({
        l1ChainId: (await l1Provider.getNetwork()).chainId,
        l2ChainId: (await l2Provider.getNetwork()).chainId,
        l1SignerOrProvider: l1Provider,
        l2SignerOrProvider: l2Provider,
        contracts: {
            l1: {
                L1CrossDomainMessenger: '0xFe7cF31c4579bb1C578716e04E1Ae16Ac5549fF0',
                AddressManager: '0x0691B7aaAc9B903c9a99B2371bCFB43601B45711',
                L1StandardBridge: '0xCAD25C95679839996F3162d8657B1CAe4517F78f',
                OptimismPortal: '0x80f86c5d3AE8cF84596FF22DB2829F1b7a9Fe83d',
                L2OutputOracle: '0x2dd44d1b04170C5623cCc55DD5ed43FAB08b0B46',
                // l1RPCUrl:
                //     'https://eth-sepolia.g.alchemy.com/v2/BQ43RWiHw-hqyM4NVLrzcYSm-ybT5tYN',
                // l2RPCUrl: 'https://pacific-rpc.sepolia-testnet.manta.network/http',
                StateCommitmentChain: '0x0000000000000000000000000000000000000000',
                CanonicalTransactionChain: '0x0000000000000000000000000000000000000000',
                BondManager: '0x0000000000000000000000000000000000000000',
            },
            l2: {
                L2CrossDomainMessenger: '0x4200000000000000000000000000000000000007'
            }
        }
    });

    const stakeHelper = new ethers.Contract(address, abi, l1Provider) as StakeHelper

    const { deployer: deployerAddress } = await getNamedAccounts()
    const deployer = await ethers.getSigner(deployerAddress)
    console.log('start staking')
    const tx = await stakeHelper.connect(deployer).stakeETH(
        deployer.address,
        2_000_000,
        '0x',
        {
            value: ethers.utils.parseEther('0.00001')
        }
    )
    await tx.wait()
    console.log('tx hash', tx.hash)
    
    const messages = await crossDomainMessenger.getMessagesByTransaction('0x79d0e5e5b6977d108b1e5e5c289e2a4ce67b0411e03bc92ae01a74bfcf4f9d4e', {
        direction: MessageDirection.L1_TO_L2
    });
    console.log('messages', messages)
    const status = await crossDomainMessenger.getMessageStatus(messages[0])
    console.log('message status', status)
}

run()