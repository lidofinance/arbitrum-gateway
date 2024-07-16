import { assert } from "chai";

import env from "../../utils/env";
import arbitrum from "../../utils/arbitrum";
import { L1ERC20ExtendedTokensBridge__factory } from "../../typechain";
import { wei } from "../../utils/wei";
import testing, { scenario } from "../../utils/testing";
import { BridgingManagerRole } from "../../utils/bridging-management";

const REVERT = env.bool("REVERT", true);

scenario("Arbitrum :: Launch integration test", ctx)
  .after(async (ctx) => {
    if (REVERT) {
      await ctx.l1Provider.send("evm_revert", [ctx.snapshot.l1]);
      await ctx.l2Provider.send("evm_revert", [ctx.snapshot.l2]);
    } else {
      console.warn(
        "Revert is skipped! Forked node restart might be required for repeated launches!"
      );
    }
  })

  .step("Enable deposits", async (ctx) => {
    const { l1ERC20TokenGateway } = ctx;
    assert.isFalse(await l1ERC20TokenGateway.isDepositsEnabled());

    await l1ERC20TokenGateway.enableDeposits();
    assert.isTrue(await l1ERC20TokenGateway.isDepositsEnabled());
  })

  .step("Renounce role", async (ctx) => {
    const { l1ERC20TokenGateway, l1DevMultisig } = ctx;
    assert.isTrue(
      await l1ERC20TokenGateway.hasRole(
        BridgingManagerRole.DEPOSITS_ENABLER_ROLE.hash,
        await l1DevMultisig.getAddress()
      )
    );

    await l1ERC20TokenGateway.renounceRole(
      BridgingManagerRole.DEPOSITS_ENABLER_ROLE.hash,
      await l1DevMultisig.getAddress()
    );
    assert.isFalse(
      await l1ERC20TokenGateway.hasRole(
        BridgingManagerRole.DEPOSITS_ENABLER_ROLE.hash,
        await l1DevMultisig.getAddress()
      )
    );
  })

  .run();

async function ctx() {
  const networkName = env.network("TESTING_ARB_NETWORK", "mainnet");
  const { l1Provider, l2Provider, l1ERC20TokenGateway } = await arbitrum
    .testing(networkName)
    .getIntegrationTestSetup();

  const hasDeployedContracts = testing.env.USE_DEPLOYED_CONTRACTS(false);
  const l1DevMultisig = hasDeployedContracts
    ? await testing.impersonate(testing.env.L1_DEV_MULTISIG(), l1Provider)
    : testing.accounts.deployer(l1Provider);

  const l1Snapshot = await l1Provider.send("evm_snapshot", []);
  const l2Snapshot = await l2Provider.send("evm_snapshot", []);

  await testing.setBalance(
    await l1DevMultisig.getAddress(),
    wei.toBigNumber(wei`1 ether`)
  );

  const l1ERC20TokenGatewayImpl = L1ERC20ExtendedTokensBridge__factory.connect(
    l1ERC20TokenGateway.address,
    l1DevMultisig
  );

  return {
    l1Provider,
    l2Provider,
    l1DevMultisig,
    l1ERC20TokenGateway: l1ERC20TokenGatewayImpl,
    snapshot: {
      l1: l1Snapshot,
      l2: l2Snapshot,
    },
  };
}
