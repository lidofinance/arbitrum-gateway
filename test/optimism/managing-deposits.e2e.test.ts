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

const DEPOSIT_ENABLER_ROLE =
  "0x4b43b36766bde12c5e9cbbc37d15f8d1f769f08f54720ab370faeb4ce893753a";
const DEPOSIT_DISABLER_ROLE =
  "0x63f736f21cb2943826cd50b191eb054ebbea670e4e962d0527611f830cd399d6";

let l2DepositsInitialState = true;

let messageTx: TransactionResponse;

const scenarioTest = scenario(
  "Optimism :: AAVE governance crosschain bridge: token bridge management",
  ctxFactory
)
  .step("LDO Holder has enought ETH", async ({ l1LDOHolder, gasAmount }) => {
    assert.gte(await l1LDOHolder.getBalance(), gasAmount);
  })

  .step("Checking deposits status", async ({ l2ERC20ExtendedTokensBridge }) => {
    l2DepositsInitialState = await l2ERC20ExtendedTokensBridge.isDepositsEnabled();
  })

  .step(`Starting DAO vote`, async (ctx) => {
    const grantRoleCalldata =
      ctx.l2ERC20ExtendedTokensBridge.interface.encodeFunctionData("grantRole", [
        l2DepositsInitialState ? DEPOSIT_DISABLER_ROLE : DEPOSIT_ENABLER_ROLE,
        ctx.govBridgeExecutor.address,
      ]);
    const grantRoleData = "0x" + grantRoleCalldata.substring(10);

    const actionCalldata = l2DepositsInitialState
      ? ctx.l2ERC20ExtendedTokensBridge.interface.encodeFunctionData("disableDeposits")
      : ctx.l2ERC20ExtendedTokensBridge.interface.encodeFunctionData("enableDeposits");

    const actionData = "0x" + actionCalldata.substring(10);

    const executorCalldata =
      await ctx.govBridgeExecutor.interface.encodeFunctionData("queue", [
        [ctx.l2ERC20ExtendedTokensBridge.address, ctx.l2ERC20ExtendedTokensBridge.address],
        [0, 0],
        [
          "grantRole(bytes32,address)",
          l2DepositsInitialState ? "disableDeposits()" : "enableDeposits()",
        ],
        [grantRoleData, actionData],
        [false, false],
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

  .step("Checking deposits state", async ({ l2ERC20ExtendedTokensBridge }) => {
    assert.equal(
      await l2ERC20ExtendedTokensBridge.isDepositsEnabled(),
      !l2DepositsInitialState
    );
  });

// make first run to change state from enabled/disabled -> disabled/enabled
scenarioTest.run();

// make another run to return the state to the initial and test vice versa actions
scenarioTest.run();

async function ctxFactory() {
  const ethOptNetwork = network.multichain(["eth", "opt"], "sepolia");

  const [l1Provider] = ethOptNetwork.getProviders({ forking: false });
  const [l1Tester, l2Tester] = ethOptNetwork.getSigners(
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
    l1Tester,
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
