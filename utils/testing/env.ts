import env from "../env";

export default {
  USE_DEPLOYED_CONTRACTS(defaultValue: boolean = false) {
    return env.bool("TESTING_USE_DEPLOYED_CONTRACTS", defaultValue);
  },

  ARB_L1_TOKEN() {
    return env.address("TESTING_ARB_L1_TOKEN");
  },
  ARB_L2_TOKEN() {
    return env.address("TESTING_ARB_L2_TOKEN");
  },
  ARB_L1_ERC20_TOKEN_GATEWAY() {
    return env.address("TESTING_ARB_L1_ERC20_TOKEN_GATEWAY");
  },
  ARB_L2_ERC20_TOKEN_GATEWAY() {
    return env.address("TESTING_ARB_L2_ERC20_TOKEN_GATEWAY");
  },
  ARB_L1_GATEWAY_ROUTER(defaultValue?: string) {
    return env.address("TESTING_ARB_L1_GATEWAY_ROUTER", defaultValue);
  },
  ARB_L2_GATEWAY_ROUTER(defaultValue?: string) {
    return env.address("TESTING_ARB_L2_GATEWAY_ROUTER", defaultValue);
  },
  ARB_GOV_BRIDGE_EXECUTOR() {
    return env.address("TESTING_ARB_GOV_BRIDGE_EXECUTOR");
  },

  OPT_L1_TOKEN() {
    return env.address("TESTING_OPT_L1_TOKEN");
  },
  OPT_L2_TOKEN() {
    return env.address("TESTING_OPT_L2_TOKEN");
  },
  OPT_L1_TOKEN_RATE_NOTIFIER() {
    return env.address("TESTING_OPT_L1_TOKEN_RATE_NOTIFIER");
  },
  OPT_L2_TOKEN_RATE_ORACLE() {
    return env.address("TESTING_OPT_L2_TOKEN_RATE_ORACLE");
  },
  OPT_L1_REBASABLE_TOKEN() {
    return env.address("TESTING_OPT_L1_REBASABLE_TOKEN");
  },
  OPT_L2_REBASABLE_TOKEN() {
    return env.address("TESTING_OPT_L2_REBASABLE_TOKEN");
  },
  OPT_L1_ERC20_TOKEN_BRIDGE() {
    return env.address("TESTING_OPT_L1_ERC20_TOKEN_BRIDGE");
  },
  OPT_L2_ERC20_TOKEN_BRIDGE() {
    return env.address("TESTING_OPT_L2_ERC20_TOKEN_BRIDGE");
  },
  OPT_GOV_BRIDGE_EXECUTOR() {
    return env.address("TESTING_OPT_GOV_BRIDGE_EXECUTOR");
  },
  L1_DEV_MULTISIG() {
    return env.address("L1_DEV_MULTISIG");
  },
  L1_TOKENS_HOLDER() {
    return env.address("TESTING_L1_TOKENS_HOLDER");
  },

  TESTING_PRIVATE_KEY() {
    return env.string("TESTING_PRIVATE_KEY");
  },
};
