import { NetworkName } from "../network";
import { OptContractAddresses, CommonOptions } from "./types";

const OptimismMainnetAddresses: OptContractAddresses = {
  L1CrossDomainMessenger: "0x25ace71c97B33Cc4729CF772ae268934F7ab5fA1",
  L2CrossDomainMessenger: "0x4200000000000000000000000000000000000007"
};

const OptimismSepoliaAddresses: OptContractAddresses = {
  L1CrossDomainMessenger: "0xFe7cF31c4579bb1C578716e04E1Ae16Ac5549fF0", // manta testnet
  L2CrossDomainMessenger: "0x4200000000000000000000000000000000000007",
};

export default function addresses(  
  networkName: NetworkName,
  options: CommonOptions = {}
) {
  switch (networkName) {
    case "mainnet":
      return { ...OptimismMainnetAddresses, ...options.customAddresses };
    case "sepolia":
      return { ...OptimismSepoliaAddresses, ...options.customAddresses };
    default:
      throw new Error(`Network "${networkName}" is not supported`);
  }
}
