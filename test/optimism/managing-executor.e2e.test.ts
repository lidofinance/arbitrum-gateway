import { assert } from "chai";
import { TransactionResponse } from "@ethersproject/providers";

import {
  L2ERC20ExtendedTokensBridge__factory,
  GovBridgeExecutor__factory,
} from "../../typechain";
import {
  E2E_TEST_CONTRACTS_OPTIMISM as E2E_TEST_CONTRACTS,
  sleep,
} from "../../utils/testing/e2e";
import env from "../../utils/env";
import { wei } from "../../utils/wei";
import network from "../../utils/network";
import { scenario } from "../../utils/testing";
import lido from "../../utils/lido";
import optimism from "../../utils/optimism";

let messageTx: TransactionResponse;
let oldGuardian: string;
let newGuardian: string;

scenario("Optimism :: AAVE governance crosschain bridge management", ctxFactory)
  .step("LDO Holder has enought ETH", async ({ l1LDOHolder, gasAmount }) => {
    assert.gte(await l1LDOHolder.getBalance(), gasAmount);
  })

  .step(`Starting DAO vote: Update guardian`, async (ctx) => {
    oldGuardian = await ctx.govBridgeExecutor.getGuardian();
    newGuardian =
      oldGuardian === "0x4e8CC9024Ea3FE886623025fF2aD0CA4bb3D1F42"
        ? "0xD06491e4C8B3107B83dC134894C4c96ED8ddbfa2"
        : "0x4e8CC9024Ea3FE886623025fF2aD0CA4bb3D1F42";

    const updateGuardianCalldata =
      ctx.govBridgeExecutor.interface.encodeFunctionData("updateGuardian", [
        newGuardian,
      ]);
    const updateGuardianData = "0x" + updateGuardianCalldata.substring(10);

    const executorCalldata =
      await ctx.govBridgeExecutor.interface.encodeFunctionData("queue", [
        [ctx.govBridgeExecutor.address],
        [0],
        ["updateGuardian(address)"],
        [updateGuardianData],
        [false],
      ]);

    const optAddresses = optimism.addresses("sepolia");

    const { calldata, callvalue } = await ctx.messaging.prepareL2Message({
      sender: ctx.lidoAragonDAO.agent.address,
      recipient: ctx.govBridgeExecutor.address,
      calldata: executorCalldata,
    });

    const tx = await ctx.lidoAragonDAO.createVote(
      ctx.l1LDOHolder,
      "E2E Test Voting",
      {
        address: ctx.lidoAragonDAO.agent.address,
        signature: "execute(address,uint256,bytes)",
        decodedCallData: [
          optAddresses.L1CrossDomainMessenger,
          callvalue,
          calldata,
        ],
      }
    );

    await tx.wait();
  })

  .step("Enacting Vote", async ({ lidoAragonDAO, l1LDOHolder }) => {
    const votesLength = await lidoAragonDAO.voting.votesLength();

    messageTx = await lidoAragonDAO.voteAndExecute(
      l1LDOHolder,
      votesLength.toNumber() - 1
    );

    await messageTx.wait();
  })

  .step("Waiting for status to change to RELAYED", async ({ messaging }) => {
    await messaging.waitForL2Message(messageTx.hash);
  })

  .step("Execute queued task", async ({ govBridgeExecutor, l2Tester }) => {
    const tasksCount = await govBridgeExecutor.getActionsSetCount();

    const targetTask = tasksCount.toNumber() - 1;

    const executionTime = (
      await govBridgeExecutor.getActionsSetById(targetTask)
    ).executionTime.toNumber();
    let chainTime;

    do {
      await sleep(5000);
      const currentBlockNumber = await l2Tester.provider.getBlockNumber();
      const currentBlock = await l2Tester.provider.getBlock(currentBlockNumber);
      chainTime = currentBlock.timestamp;
    } while (chainTime <= executionTime);

    const tx = await govBridgeExecutor.execute(targetTask);
    await tx.wait();
  })

  .step("Checking guardian", async ({ govBridgeExecutor }) => {
    assert.equal(await govBridgeExecutor.getGuardian(), newGuardian);
  })

  .run();

async function ctxFactory() {
  const ethOptNetwork = network.multichain(["eth", "opt"], "sepolia");

  const [l1Provider] = ethOptNetwork.getProviders({ forking: false });
  const [, l2Tester] = ethOptNetwork.getSigners(
    env.string("TESTING_PRIVATE_KEY"),
    { forking: false }
  );

  const [l1LDOHolder] = ethOptNetwork.getSigners(
    env.string("TESTING_OPT_LDO_HOLDER_PRIVATE_KEY"),
    { forking: false }
  );

  return {
    lidoAragonDAO: lido("sepolia", l1Provider),
    messaging: optimism.messaging("sepolia", { forking: false }),
    gasAmount: wei`0.1 ether`,
    l2Tester,
    l1LDOHolder,
    l2ERC20ExtendedTokensBridge: L2ERC20ExtendedTokensBridge__factory.connect(
      E2E_TEST_CONTRACTS.l2.l2ERC20ExtendedTokensBridge,
      l2Tester
    ),
    govBridgeExecutor: GovBridgeExecutor__factory.connect(
      E2E_TEST_CONTRACTS.l2.govBridgeExecutor,
      l2Tester
    ),
  };
}
