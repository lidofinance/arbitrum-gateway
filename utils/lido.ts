import aragon from "./aragon";
import { SignerOrProvider } from "./network";

type AragonEnvSetupName = "mainnet" | "mainnet_test" | "sepolia";

const ARAGON_MAINNET_TESTING = {
  agent: "0x184d39300f2fA4419d04998e9C58Cb5De586d879",
  voting: "0x124208720f804A9ded96F0CD532018614b8aE28d",
  tokenManager: "0xdAc681011f846Af90AEbd11d0C9Cc6BCa70Dd636",
};

const ARAGON_MAINNET = {
  agent: "0x3e40D73EB977Dc6a537aF587D48316feE66E9C8c",
  voting: "0x2e59A20f205bB85a89C53f1936454680651E618e",
  tokenManager: "0xf73a1260d222f447210581DDf212D915c09a3249",
};

const ARAGON_SEPOLIA = {
  agent: "0x32A0E5828B62AAb932362a4816ae03b860b65e83",
  voting: "0x39A0EbdEE54cB319f4F42141daaBDb6ba25D341A",
  tokenManager: "0xC73cd4B2A7c1CBC5BF046eB4A7019365558ABF66",
};

const ARAGON_CONTRACTS_BY_NAME = {
  mainnet: ARAGON_MAINNET,
  mainnet_test: ARAGON_MAINNET_TESTING,
  sepolia: ARAGON_SEPOLIA,
};

export default function lido(
  envSetupName: AragonEnvSetupName,
  signerOrProvider: SignerOrProvider
) {
  return aragon(ARAGON_CONTRACTS_BY_NAME[envSetupName], signerOrProvider);
}
