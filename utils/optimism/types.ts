import { Overrides, Wallet } from "ethers";
import { Logger } from "../deployment/DeployScript";

export type OptContractNames =
  | "L1CrossDomainMessenger"
  | "L2CrossDomainMessenger";

export type OptContractAddresses = Record<OptContractNames, string>;
export type CustomOptContractAddresses = Partial<OptContractAddresses>;
export interface CommonOptions {
  customAddresses?: CustomOptContractAddresses;
}

export interface DeployScriptParams {
    deployer: Wallet;
    admins: {
        proxy: string;
        bridge: string
    };
    contractsShift: number;
}

export interface OptDeploymentOptions extends CommonOptions {
    logger?: Logger;
    overrides?: Overrides;
}
