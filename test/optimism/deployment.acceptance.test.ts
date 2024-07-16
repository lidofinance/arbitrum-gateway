import { assert } from "chai";
import {
  IERC20Metadata__factory,
  OssifiableProxy__factory,
} from "../../typechain";
import { BridgingManagerRole } from "../../utils/bridging-management";
import deployment from "../../utils/deployment";
import env from "../../utils/env";
import optimism from "../../utils/optimism";
import { getRoleHolders, scenario } from "../../utils/testing";
import { wei } from "../../utils/wei";

scenario("Optimism Bridge :: deployment acceptance test", ctxFactory)
  .step("L1 Bridge :: proxy admin", async (ctx) => {
    assert.equal(
      await ctx.l1LidoTokensBridgeProxy.proxy__getAdmin(),
      ctx.deployment.l1.proxyAdmin
    );
  })
  .step("L1 Bridge :: bridge admin", async (ctx) => {
    const currentAdmins = await getRoleHolders(
      ctx.l1LidoTokensBridge,
      BridgingManagerRole.DEFAULT_ADMIN_ROLE.hash
    );
    assert.equal(currentAdmins.size, 1);
    assert.isTrue(currentAdmins.has(ctx.deployment.l1.bridgeAdmin));

    await assert.isTrue(
      await ctx.l1LidoTokensBridge.hasRole(
        BridgingManagerRole.DEFAULT_ADMIN_ROLE.hash,
        ctx.deployment.l1.bridgeAdmin
      )
    );
  })
  .step("L1 bridge :: L1 token", async (ctx) => {
    assert.equal(await ctx.l1LidoTokensBridge.L1_TOKEN_NON_REBASABLE(), ctx.deployment.token);
  })
  .step("L1 bridge :: L2 token", async (ctx) => {
    assert.equal(
      await ctx.l1LidoTokensBridge.L2_TOKEN_NON_REBASABLE(),
      ctx.erc20Bridged.address
    );
  })
  .step("L1 bridge :: L2 token bridge", async (ctx) => {
    assert.equal(
      await ctx.l1LidoTokensBridge.l2TokenBridge(),
      ctx.l2ERC20ExtendedTokensBridge.address
    );
  })
  .step("L1 Bridge :: is deposits enabled", async (ctx) => {
    assert.equal(
      await ctx.l1LidoTokensBridge.isDepositsEnabled(),
      ctx.deployment.l1.depositsEnabled
    );
  })
  .step("L1 Bridge :: is withdrawals enabled", async (ctx) => {
    assert.equal(
      await ctx.l1LidoTokensBridge.isWithdrawalsEnabled(),
      ctx.deployment.l1.withdrawalsEnabled
    );
  })
  .step("L1 Bridge :: deposits enablers", async (ctx) => {
    const actualDepositsEnablers = await getRoleHolders(
      ctx.l1LidoTokensBridge,
      BridgingManagerRole.DEPOSITS_ENABLER_ROLE.hash
    );
    const expectedDepositsEnablers = ctx.deployment.l1.depositsEnablers || [];

    assert.equal(actualDepositsEnablers.size, expectedDepositsEnablers.length);
    for (const expectedDepositsEnabler of expectedDepositsEnablers) {
      assert.isTrue(actualDepositsEnablers.has(expectedDepositsEnabler));
    }
  })
  .step("L1 Bridge :: deposits disablers", async (ctx) => {
    const actualDepositsDisablers = await getRoleHolders(
      ctx.l1LidoTokensBridge,
      BridgingManagerRole.DEPOSITS_DISABLER_ROLE.hash
    );
    const expectedDepositsDisablers = ctx.deployment.l1.depositsDisablers || [];
    assert.equal(
      actualDepositsDisablers.size,
      expectedDepositsDisablers.length
    );
    for (const expectedDepositsDisabler of expectedDepositsDisablers) {
      assert.isTrue(actualDepositsDisablers.has(expectedDepositsDisabler));
    }
  })
  .step("L1 Bridge :: withdrawals enablers", async (ctx) => {
    const actualWithdrawalsEnablers = await getRoleHolders(
      ctx.l1LidoTokensBridge,
      BridgingManagerRole.WITHDRAWALS_ENABLER_ROLE.hash
    );
    const expectedWithdrawalsEnablers =
      ctx.deployment.l1.withdrawalsEnablers || [];

    assert.equal(
      actualWithdrawalsEnablers.size,
      expectedWithdrawalsEnablers.length
    );
    for (const expectedWithdrawalsEnabler of expectedWithdrawalsEnablers) {
      assert.isTrue(actualWithdrawalsEnablers.has(expectedWithdrawalsEnabler));
    }
  })
  .step("L1 Bridge :: withdrawals disablers", async (ctx) => {
    const actualWithdrawalsDisablers = await getRoleHolders(
      ctx.l1LidoTokensBridge,
      BridgingManagerRole.WITHDRAWALS_DISABLER_ROLE.hash
    );
    const expectedWithdrawalsDisablers =
      ctx.deployment.l1.withdrawalsDisablers || [];

    assert.equal(
      actualWithdrawalsDisablers.size,
      expectedWithdrawalsDisablers.length
    );
    for (const expectedWithdrawalsDisabler of expectedWithdrawalsDisablers) {
      assert.isTrue(
        actualWithdrawalsDisablers.has(expectedWithdrawalsDisabler)
      );
    }
  })

  .step("L2 Bridge :: proxy admin", async (ctx) => {
    assert.equal(
      await ctx.l2ERC20ExtendedTokensBridgeProxy.proxy__getAdmin(),
      ctx.deployment.l2.proxyAdmin
    );
  })
  .step("L2 Bridge :: bridge admin", async (ctx) => {
    const currentAdmins = await getRoleHolders(
      ctx.l2ERC20ExtendedTokensBridge,
      BridgingManagerRole.DEFAULT_ADMIN_ROLE.hash
    );
    assert.equal(currentAdmins.size, 1);
    assert.isTrue(currentAdmins.has(ctx.deployment.l2.bridgeAdmin));

    await assert.isTrue(
      await ctx.l2ERC20ExtendedTokensBridge.hasRole(
        BridgingManagerRole.DEFAULT_ADMIN_ROLE.hash,
        ctx.deployment.l2.bridgeAdmin
      )
    );
  })
  .step("L2 bridge :: L1 token", async (ctx) => {
    assert.equal(await ctx.l2ERC20ExtendedTokensBridge.L1_TOKEN_NON_REBASABLE(), ctx.deployment.token);
  })
  .step("L2 bridge :: L2 token", async (ctx) => {
    assert.equal(
      await ctx.l2ERC20ExtendedTokensBridge.L2_TOKEN_NON_REBASABLE(),
      ctx.erc20Bridged.address
    );
  })
  .step("L2 bridge :: L1 token bridge", async (ctx) => {
    assert.equal(
      await ctx.l2ERC20ExtendedTokensBridge.l1TokenBridge(),
      ctx.l1LidoTokensBridge.address
    );
  })
  .step("L2 Bridge :: is deposits enabled", async (ctx) => {
    assert.equal(
      await ctx.l2ERC20ExtendedTokensBridge.isDepositsEnabled(),
      ctx.deployment.l2.depositsEnabled
    );
  })
  .step("L2 Bridge :: is withdrawals enabled", async (ctx) => {
    assert.equal(
      await ctx.l2ERC20ExtendedTokensBridge.isWithdrawalsEnabled(),
      ctx.deployment.l2.withdrawalsEnabled
    );
  })
  .step("L2 Bridge :: deposits enablers", async (ctx) => {
    const actualDepositsEnablers = await getRoleHolders(
      ctx.l2ERC20ExtendedTokensBridge,
      BridgingManagerRole.DEPOSITS_ENABLER_ROLE.hash
    );
    const expectedDepositsEnablers = ctx.deployment.l2.depositsEnablers || [];

    assert.equal(actualDepositsEnablers.size, expectedDepositsEnablers.length);
    for (const expectedDepositsEnabler of expectedDepositsEnablers) {
      assert.isTrue(actualDepositsEnablers.has(expectedDepositsEnabler));
    }
  })
  .step("L2 Bridge :: deposits disablers", async (ctx) => {
    const actualDepositsDisablers = await getRoleHolders(
      ctx.l2ERC20ExtendedTokensBridge,
      BridgingManagerRole.DEPOSITS_DISABLER_ROLE.hash
    );
    const expectedDepositsDisablers = ctx.deployment.l2.depositsDisablers || [];

    assert.equal(
      actualDepositsDisablers.size,
      expectedDepositsDisablers.length
    );
    for (const expectedDepositsDisabler of expectedDepositsDisablers) {
      assert.isTrue(actualDepositsDisablers.has(expectedDepositsDisabler));
    }
  })
  .step("L2 Bridge :: withdrawals enablers", async (ctx) => {
    const actualWithdrawalsEnablers = await getRoleHolders(
      ctx.l2ERC20ExtendedTokensBridge,
      BridgingManagerRole.WITHDRAWALS_ENABLER_ROLE.hash
    );
    const expectedWithdrawalsEnablers =
      ctx.deployment.l2.withdrawalsEnablers || [];

    assert.equal(
      actualWithdrawalsEnablers.size,
      expectedWithdrawalsEnablers.length
    );
    for (const expectedWithdrawalsEnabler of expectedWithdrawalsEnablers) {
      assert.isTrue(actualWithdrawalsEnablers.has(expectedWithdrawalsEnabler));
    }
  })
  .step("L2 Bridge :: withdrawals disablers", async (ctx) => {
    const actualWithdrawalsDisablers = await getRoleHolders(
      ctx.l2ERC20ExtendedTokensBridge,
      BridgingManagerRole.WITHDRAWALS_DISABLER_ROLE.hash
    );
    const expectedWithdrawalsDisablers =
      ctx.deployment.l2.withdrawalsDisablers || [];

    assert.equal(
      actualWithdrawalsDisablers.size,
      expectedWithdrawalsDisablers.length
    );
    for (const expectedWithdrawalsDisabler of expectedWithdrawalsDisablers) {
      assert.isTrue(
        actualWithdrawalsDisablers.has(expectedWithdrawalsDisabler)
      );
    }
  })

  .step("L2 Token :: proxy admin", async (ctx) => {
    assert.equal(
      await ctx.erc20BridgedProxy.proxy__getAdmin(),
      ctx.deployment.l2.proxyAdmin
    );
  })
  .step("L2 Token :: name", async (ctx) => {
    assert.equal(await ctx.erc20Bridged.name(), ctx.l2TokenInfo.name);
  })
  .step("L2 Token :: symbol", async (ctx) => {
    assert.equal(await ctx.erc20Bridged.symbol(), ctx.l2TokenInfo.symbol);
  })
  .step("L2 Token :: decimals", async (ctx) => {
    assert.equal(await ctx.erc20Bridged.decimals(), ctx.l2TokenInfo.decimals);
  })
  .step("L2 Token :: total supply", async (ctx) => {
    assert.equalBN(await ctx.erc20Bridged.totalSupply(), wei`0`);
  })
  .step("L2 token :: bridge", async (ctx) => {
    assert.equalBN(
      await ctx.erc20Bridged.bridge(),
      ctx.l2ERC20ExtendedTokensBridge.address
    );
  })

  .run();

async function ctxFactory() {
  const networkName = env.network();
  const deploymentConfig = deployment.loadMultiChainDeploymentConfig();
  const testingSetup = await optimism
    .testing(networkName)
    .getAcceptanceTestSetup();

  const l1Token = IERC20Metadata__factory.connect(
    deploymentConfig.token,
    testingSetup.l1Provider
  );

  const [name, symbol, decimals] = await Promise.all([
    l1Token.name(),
    l1Token.symbol(),
    l1Token.decimals(),
  ]);

  return {
    deployment: deploymentConfig,
    l2TokenInfo: {
      name,
      symbol,
      decimals,
    },
    l1LidoTokensBridge: testingSetup.l1LidoTokensBridge,
    l1LidoTokensBridgeProxy: OssifiableProxy__factory.connect(
      testingSetup.l1LidoTokensBridge.address,
      testingSetup.l1Provider
    ),
    l2ERC20ExtendedTokensBridge: testingSetup.l2ERC20ExtendedTokensBridge,
    l2ERC20ExtendedTokensBridgeProxy: OssifiableProxy__factory.connect(
      testingSetup.l2ERC20ExtendedTokensBridge.address,
      testingSetup.l2Provider
    ),
    erc20Bridged: testingSetup.l2Token,
    erc20BridgedProxy: OssifiableProxy__factory.connect(
      testingSetup.l2Token.address,
      testingSetup.l2Provider
    ),
  };
}
