import * as dotenv from "dotenv";

import { HardhatUserConfig } from "hardhat/config";
import "@nomiclabs/hardhat-etherscan";
import "@nomiclabs/hardhat-waffle";
import "@typechain/hardhat";
import "hardhat-gas-reporter";
import "solidity-coverage";
import "hardhat-deploy"

import "./tasks/fork-node";
import env from "./utils/env";

dotenv.config();

const ethDeployerPk: string | undefined = process.env.ETH_DEPLOYER_PRIVATE_KEY;
if (!ethDeployerPk) {
    throw new Error('Please set your ETH_DEPLOYER_PRIVATE_KEY in a .env file');
}

const config: HardhatUserConfig = {
  namedAccounts: {
    deployer: {
      default: 0, // here this will by default take the first account as deployer
    },
  },
  solidity: {
    compilers: [
      {
        version: "0.6.11",
        settings: {
          optimizer: {
            enabled: true,
            runs: 100,
          },
        },
      },
      {
        version: "0.8.10",
        settings: {
          optimizer: {
            enabled: true,
            runs: 100_000,
          },
        },
      },
    ],
  },
  networks: {
    // Ethereum Public Chains
    eth_mainnet: {
      url: env.string("RPC_ETH_MAINNET", ""),
      deploy: ['./scripts/manta/deploy'],
      accounts: [`0x${ethDeployerPk}`],
    },
    eth_sepolia: {
      url: env.string("RPC_ETH_SEPOLIA", ""),
      deploy: ['./scripts/manta/deploy'],
      accounts: [`0x${ethDeployerPk}`],
    },

    // Ethereum Fork Chains
    eth_mainnet_fork: {
      url: "http://localhost:8545",
    },
    eth_sepolia_fork: {
      url: "http://localhost:8545",
    },

    // Arbitrum Public Chains
    arb_mainnet: {
      url: env.string("RPC_ARB_MAINNET", ""),
    },
    arb_sepolia: {
      url: env.string("RPC_ARB_SEPOLIA", ""),
    },

    // Arbitrum Fork Chains
    arb_mainnet_fork: {
      url: "http://localhost:8546",
    },
    arb_sepolia_fork: {
      url: "http://localhost:8546",
    },

    // Optimism Public Chains
    opt_mainnet: {
      url: env.string("RPC_OPT_MAINNET", ""),
    },
    // @NOTE: currently used for manta L2 
    opt_sepolia: {
      url: env.string("RPC_OPT_SEPOLIA", ""),
    },

    // Optimism Fork Chains
    opt_mainnet_fork: {
      url: "http://localhost:9545",
    },
    opt_sepolia_fork: {
      url: "http://localhost:9545",
    },
  },
  gasReporter: {
    enabled: env.string("REPORT_GAS", "false") !== "false",
    currency: "USD",
  },
  etherscan: {
    apiKey: {
      mainnet: env.string("ETHERSCAN_API_KEY_ETH", ""),
      sepolia: env.string("ETHERSCAN_API_KEY_ETH", ""),
      eth_sepolia: env.string("ETHERSCAN_API_KEY_ETH", ""),
      eth_mainnet: env.string("ETHERSCAN_API_KEY_ETH", ""),
      arbitrumOne: env.string("ETHERSCAN_API_KEY_ARB", ""),
      optimisticEthereum: env.string("ETHERSCAN_API_KEY_OPT", ""),
      "opt_sepolia": env.string("ETHERSCAN_API_KEY_OPT", ""),
    },

    customChains: [
        {
          network: 'sepolia',
          chainId: 11155111,
          urls: {
            apiURL: 'https://api-sepolia.etherscan.io/api',
            browserURL: 'https://sepolia.etherscan.io',
          },
        },
        {
            network: 'opt_sepolia',
            chainId: 3441006,
            urls: {
              apiURL: 'https://manta-sepolia.rpc.caldera.xyz/http',
              browserURL: 'https://manta-sepolia.explorer.caldera.xyz',
            },
          },
      ],
  },
  typechain: {
    externalArtifacts: [
      "./interfaces/**/*.json",
      "./utils/optimism/artifacts/*.json",
      "./utils/arbitrum/artifacts/*.json",
    ],
  },
  mocha: {
    timeout: 20 * 60 * 60 * 1000, // 20 minutes for e2e tests
  },
};

export default config;
