import {
    CrossChainMessenger,
    DAIBridgeAdapter,
    MessageStatus,
  } from "@eth-optimism/sdk";
  import { assert } from "chai";
  import { TransactionResponse } from "@ethersproject/providers";

  import env from "../../utils/env";
  import { wei } from "../../utils/wei";
  import network from "../../utils/network";
  import optimism from "../../utils/optimism";
  import { ERC20Mintable } from "../../typechain";
  import { scenario } from "../../utils/testing";
  import { sleep } from "../../utils/testing/e2e";
  import { LidoBridgeAdapter } from "../../utils/optimism/LidoBridgeAdapter";

  let depositTokensTxResponse: TransactionResponse;
  let withdrawTokensTxResponse: TransactionResponse;

  scenario("Optimism :: Bridging via depositTo/withdrawTo E2E test", ctxFactory)
    .step(
      "Validate tester has required amount of L1 token",
      async ({ l1TokenRebasable, l1Tester, depositAmount }) => {
        const balanceBefore = await l1TokenRebasable.balanceOf(l1Tester.address);
        if (balanceBefore.lt(depositAmount)) {
          try {
            await (l1TokenRebasable as ERC20Mintable).mint(
              l1Tester.address,
              depositAmount
            );
          } catch {}
          const balanceAfter = await l1TokenRebasable.balanceOf(l1Tester.address);
          assert.isTrue(
            balanceAfter.gte(depositAmount),
            "Tester has not enough L1 token"
          );
        }
      }
    )

    .step("Set allowance for L1LidoTokensBridge to deposit", async (ctx) => {
      const allowanceTxResponse = await ctx.crossChainMessenger.approveERC20(
        ctx.l1TokenRebasable.address,
        ctx.l2TokenRebasable.address,
        ctx.depositAmount
      );

      await allowanceTxResponse.wait();

      assert.equalBN(
        await ctx.l1TokenRebasable.allowance(
          ctx.l1Tester.address,
          ctx.l1LidoTokensBridge.address
        ),
        ctx.depositAmount
      );
    })

    .step("Bridge tokens to L2 via depositERC20To()", async (ctx) => {
      depositTokensTxResponse = await ctx.l1LidoTokensBridge
        .connect(ctx.l1Tester)
        .depositERC20To(
          ctx.l1TokenRebasable.address,
          ctx.l2TokenRebasable.address,
          ctx.l1Tester.address,
          ctx.depositAmount,
          2_000_000,
          "0x"
        );

      await depositTokensTxResponse.wait();
    })

    .step("Waiting for status to change to RELAYED", async (ctx) => {
      await ctx.crossChainMessenger.waitForMessageStatus(
        depositTokensTxResponse.hash,
        MessageStatus.RELAYED
      );
    })

    .step("Withdraw tokens from L2 via withdrawERC20To()", async (ctx) => {
      withdrawTokensTxResponse = await ctx.l2ERC20ExtendedTokensBridge
        .connect(ctx.l2Tester)
        .withdrawTo(
          ctx.l2TokenRebasable.address,
          ctx.l1Tester.address,
          ctx.withdrawalAmount,
          0,
          "0x"
        );
      await withdrawTokensTxResponse.wait();
    })

    .step("Waiting for status to change to READY_TO_PROVE", async (ctx) => {
      await ctx.crossChainMessenger.waitForMessageStatus(
        withdrawTokensTxResponse.hash,
        MessageStatus.READY_TO_PROVE
      );
    })

    .step("Proving the L2 -> L1 message", async (ctx) => {
      const tx = await ctx.crossChainMessenger.proveMessage(
        withdrawTokensTxResponse.hash
      );
      await tx.wait();
    })

    .step("Waiting for status to change to IN_CHALLENGE_PERIOD", async (ctx) => {
      await ctx.crossChainMessenger.waitForMessageStatus(
        withdrawTokensTxResponse.hash,
        MessageStatus.IN_CHALLENGE_PERIOD
      );
    })

    .step("Waiting for status to change to READY_FOR_RELAY", async (ctx) => {
      await ctx.crossChainMessenger.waitForMessageStatus(
        withdrawTokensTxResponse.hash,
        MessageStatus.READY_FOR_RELAY
      );
    })

    .step("Finalizing L2 -> L1 message", async (ctx) => {
      const finalizationPeriod = await ctx.crossChainMessenger.contracts.l1.L2OutputOracle.FINALIZATION_PERIOD_SECONDS();
      await sleep(finalizationPeriod * 1000);
      await ctx.crossChainMessenger.finalizeMessage(withdrawTokensTxResponse);
    })

    .step("Waiting for status to change to RELAYED", async (ctx) => {
      await ctx.crossChainMessenger.waitForMessageStatus(
        withdrawTokensTxResponse,
        MessageStatus.RELAYED
      );
    })

    .run();

  async function ctxFactory() {
    const networkName = env.network("TESTING_OPT_NETWORK", "sepolia");
    const testingSetup = await optimism.testing(networkName).getE2ETestSetup();

    return {
      depositAmount: wei`0.0025 ether`,
      withdrawalAmount: wei`0.0025 ether`,
      l1Tester: testingSetup.l1Tester,
      l2Tester: testingSetup.l2Tester,
      l1TokenRebasable: testingSetup.l1TokenRebasable,
      l2TokenRebasable: testingSetup.l2TokenRebasable,
      l1LidoTokensBridge: testingSetup.l1LidoTokensBridge,
      l2ERC20ExtendedTokensBridge: testingSetup.l2ERC20ExtendedTokensBridge,
      crossChainMessenger: new CrossChainMessenger({
        l2ChainId: network.chainId("opt", networkName),
        l1ChainId: network.chainId("eth", networkName),
        l1SignerOrProvider: testingSetup.l1Tester,
        l2SignerOrProvider: testingSetup.l2Tester,
        bridges: {
          LidoBridge: {
            Adapter: LidoBridgeAdapter,
            l1Bridge: testingSetup.l1LidoTokensBridge.address,
            l2Bridge: testingSetup.l2ERC20ExtendedTokensBridge.address,
          },
        },
      }),
    };
  }
