import { assert } from "chai";

import env from "../../utils/env";
import { wei } from "../../utils/wei";
import optimism from "../../utils/optimism";
import testing, { scenario } from "../../utils/testing";

scenario("Optimism :: Bridging integration test", ctxFactory)
  .after(async (ctx) => {
    await ctx.l1Provider.send("evm_revert", [ctx.snapshot.l1]);
    await ctx.l2Provider.send("evm_revert", [ctx.snapshot.l2]);
  })

  .step("Activate bridging on L1", async (ctx) => {
    const { l1LidoTokensBridge } = ctx;
    const { l1ERC20ExtendedTokensBridgeAdmin } = ctx.accounts;

    const isDepositsEnabled = await l1LidoTokensBridge.isDepositsEnabled();

    if (!isDepositsEnabled) {
      await l1LidoTokensBridge
        .connect(l1ERC20ExtendedTokensBridgeAdmin)
        .enableDeposits();
    } else {
      console.log("L1 deposits already enabled");
    }

    const isWithdrawalsEnabled =
      await l1LidoTokensBridge.isWithdrawalsEnabled();

    if (!isWithdrawalsEnabled) {
      await l1LidoTokensBridge
        .connect(l1ERC20ExtendedTokensBridgeAdmin)
        .enableWithdrawals();
    } else {
      console.log("L1 withdrawals already enabled");
    }

    assert.isTrue(await l1LidoTokensBridge.isDepositsEnabled());
    assert.isTrue(await l1LidoTokensBridge.isWithdrawalsEnabled());
  })

  .step("Activate bridging on L2", async (ctx) => {
    const { l2ERC20ExtendedTokensBridge } = ctx;
    const { l2ERC20ExtendedTokensBridgeAdmin } = ctx.accounts;

    const isDepositsEnabled = await l2ERC20ExtendedTokensBridge.isDepositsEnabled();

    if (!isDepositsEnabled) {
      await l2ERC20ExtendedTokensBridge
        .connect(l2ERC20ExtendedTokensBridgeAdmin)
        .enableDeposits();
    } else {
      console.log("L2 deposits already enabled");
    }

    const isWithdrawalsEnabled =
      await l2ERC20ExtendedTokensBridge.isWithdrawalsEnabled();

    if (!isWithdrawalsEnabled) {
      await l2ERC20ExtendedTokensBridge
        .connect(l2ERC20ExtendedTokensBridgeAdmin)
        .enableWithdrawals();
    } else {
      console.log("L2 withdrawals already enabled");
    }

    assert.isTrue(await l2ERC20ExtendedTokensBridge.isDepositsEnabled());
    assert.isTrue(await l2ERC20ExtendedTokensBridge.isWithdrawalsEnabled());
  })

  .step("L1 -> L2 deposit zero tokens via depositERC20() method", async (ctx) => {
    const {
      l1Token,
      l2Token,
      l1TokenRebasable,
      l1LidoTokensBridge,
      l2TokenRebasable
    } = ctx;

    const { accountA: tokenHolderA } = ctx.accounts;
    const stEthPerToken = await l1Token.stEthPerToken();

    await l1TokenRebasable
      .connect(tokenHolderA.l1Signer)
      .approve(l1LidoTokensBridge.address, 10);

    await l1Token
      .connect(tokenHolderA.l1Signer)
      .approve(l1LidoTokensBridge.address, 10);

    const tokenHolderABalanceBefore = await l1Token.balanceOf(
      tokenHolderA.address
    );
    console.log("tokenHolderABalanceBefore=",tokenHolderABalanceBefore);

    const l1ERC20ExtendedTokensBridgeBalanceBefore = await l1TokenRebasable.balanceOf(
        l1LidoTokensBridge.address
    );

    const tx0 = await l1LidoTokensBridge
    .connect(tokenHolderA.l1Signer)
    .depositERC20(
      l1Token.address,
      l2Token.address,
      10,
      200_000,
      "0x"
    );

    const receipt0 = await tx0.wait();
    console.log("l1Token gasUsed=",receipt0.gasUsed);

    const tx1 = await l1LidoTokensBridge
      .connect(tokenHolderA.l1Signer)
      .depositERC20(
        l1TokenRebasable.address,
        l2TokenRebasable.address,
        10,
        200_000,
        "0x"
      );

      const receipt1 = await tx1.wait();
      console.log("l1TokenRebasable gasUsed=",receipt1.gasUsed);

      const gasDifference = receipt1.gasUsed.sub(receipt0.gasUsed);
      console.log("gasUsed difference=", gasDifference);
  })



  .run();

async function ctxFactory() {
  const networkName = env.network("TESTING_OPT_NETWORK", "mainnet");
  console.log("networkName=",networkName);

  const {
    l1Provider,
    l2Provider,
    l1ERC20ExtendedTokensBridgeAdmin,
    l2ERC20ExtendedTokensBridgeAdmin,
    ...contracts
  } = await optimism.testing(networkName).getIntegrationTestSetup();

  const l1Snapshot = await l1Provider.send("evm_snapshot", []);
  const l2Snapshot = await l2Provider.send("evm_snapshot", []);

  const accountA = testing.accounts.accountA(l1Provider, l2Provider);
  const accountB = testing.accounts.accountB(l1Provider, l2Provider);

  const depositAmount = wei`0.15 ether`;
  const withdrawalAmount = wei`0.05 ether`;

  await testing.setBalance(
    await contracts.l1TokensHolder.getAddress(),
    wei.toBigNumber(wei`1 ether`),
    l1Provider
  );

  await testing.setBalance(
    await l1ERC20ExtendedTokensBridgeAdmin.getAddress(),
    wei.toBigNumber(wei`1 ether`),
    l1Provider
  );

  await testing.setBalance(
    await l2ERC20ExtendedTokensBridgeAdmin.getAddress(),
    wei.toBigNumber(wei`1 ether`),
    l2Provider
  );

  await contracts.l1Token
  .connect(contracts.l1TokensHolder)
  .transfer(accountA.l1Signer.address, depositAmount);

  await contracts.l1TokenRebasable
    .connect(contracts.l1TokensHolder)
    .transfer(accountA.l1Signer.address, wei.toBigNumber(depositAmount).mul(2));

  const l1CrossDomainMessengerAliased = await testing.impersonate(
    testing.accounts.applyL1ToL2Alias(contracts.l1CrossDomainMessenger.address),
    l2Provider
  );

  console.log("l1CrossDomainMessengerAliased=",l1CrossDomainMessengerAliased);
  console.log("contracts.l1CrossDomainMessenger.address=",contracts.l1CrossDomainMessenger.address);

  await testing.setBalance(
    await l1CrossDomainMessengerAliased.getAddress(),
    wei.toBigNumber(wei`1 ether`),
    l2Provider
  );

  return {
    l1Provider,
    l2Provider,
    ...contracts,
    accounts: {
      accountA,
      accountB,
      l1Stranger: testing.accounts.stranger(l1Provider),
      l1ERC20ExtendedTokensBridgeAdmin,
      l2ERC20ExtendedTokensBridgeAdmin,
      l1CrossDomainMessengerAliased,
    },
    common: {
      depositAmount,
      withdrawalAmount,
    },
    snapshot: {
      l1: l1Snapshot,
      l2: l2Snapshot,
    },
  };
}
