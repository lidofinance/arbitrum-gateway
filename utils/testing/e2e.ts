import { AddressLike } from "@eth-optimism/sdk";
import { ethers } from "hardhat";
import { wei } from "../wei";

const abiCoder = ethers.utils.defaultAbiCoder;

export const E2E_TEST_CONTRACTS_OPTIMISM = {
  l1: {
    l1Token: "0xB82381A3fBD3FaFA77B3a7bE693342618240067b",
    l1LDOToken: "0xd06dF83b8ad6D89C86a187fba4Eae918d497BdCB",
    l1ERC20ExtendedTokensBridge: "0x4Abf633d9c0F4aEebB4C2E3213c7aa1b8505D332",
    aragonVoting: "0x39A0EbdEE54cB319f4F42141daaBDb6ba25D341A",
    tokenManager: "0xC73cd4B2A7c1CBC5BF046eB4A7019365558ABF66",
    agent: "0x32A0E5828B62AAb932362a4816ae03b860b65e83",
    l1CrossDomainMessenger: "0x58Cc85b8D04EA49cC6DBd3CbFFd00B4B8D6cb3ef",
  },
  l2: {
    l2Token: "0x24B47cd3A74f1799b32B2de11073764Cb1bb318B",
    l2ERC20ExtendedTokensBridge: "0xdBA2760246f315203F8B716b3a7590F0FFdc704a",
    govBridgeExecutor: "0xf695357C66bA514150Da95b189acb37b46DDe602",
  },
};

export const E2E_TEST_CONTRACTS_ARBITRUM = {
  l1: {
    l1Token: "0x7AEE39c46f20135114e85A03C02aB4FE73fB8127",
    l1GatewayRouter: "0xa2a8F940752aDc4A3278B63B96d56D72D2b075B1",
    l1ERC20TokenGateway: "0x46b10f1E65f19876F50bfdD59C9B39E9De6B9150",
    aragonVoting: "0x04F9590D3EEC8e619D7714ffeF664aD3fd53b880",
    tokenManager: "0x1ee7e87486f9ae6e27a5e58310a5319394360cf0",
    agent: "0x12869c3349f993c5c20bab9482b7d16aff0ae2f9",
    l1LDOToken: "0x84b4c77b260910fc02dddac41ef0e45e658b18af",
    inbox: "0x578BAde599406A8fE3d24Fd7f7211c0911F5B29e",
  },
  l2: {
    l2Token: "0x57FA50b80f79b9140fe7249A93D432d9fa8C4192",
    l2GatewayRouter: "0x57f54f87C44d816f60b92864e23b8c0897D4d81D",
    l2ERC20TokenGateway: "0xD06491e4C8B3107B83dC134894C4c96ED8ddbfa2",
    govBridgeExecutor: "0x4e8CC9024Ea3FE886623025fF2aD0CA4bb3D1F42",
  },
};

export const createOptimismVoting = async (
  ctx: any,
  executorCalldata: string
) => {
  const messageCalldata =
    await ctx.l1CrossDomainMessenger.interface.encodeFunctionData(
      "sendMessage",
      [ctx.govBridgeExecutor.address, executorCalldata, 1000000]
    );
  const messageEvmScript = encodeEVMScript(
    ctx.l1CrossDomainMessenger.address,
    messageCalldata
  );

  const agentCalldata = ctx.agent.interface.encodeFunctionData("forward", [
    messageEvmScript,
  ]);
  const agentEvmScript = encodeEVMScript(ctx.agent.address, agentCalldata);

  const newVoteCalldata =
    "0xd5db2c80" +
    abiCoder.encode(["bytes", "string"], [agentEvmScript, ""]).substring(2);
  const votingEvmScript = encodeEVMScript(ctx.voting.address, newVoteCalldata);

  const newVotingTx = await ctx.tokenMnanager.forward(votingEvmScript);

  await newVotingTx.wait();
};

export const encodeEVMScript = (
  target: AddressLike,
  messageCalldata: string
) => {
  const calldataLength = abiCoder
    .encode(["uint256"], [Math.trunc(messageCalldata.length / 2) - 1])
    .substring(58);
  return (
    "0x00000001" +
    target.substring(2) +
    calldataLength +
    messageCalldata.substring(2)
  );
};

export const createArbitrumVoting = async (
  ctx: any,
  executorCalldata: string,
  options: Record<string, any> = {}
) => {
  const messageCalldata = await ctx.inbox.interface.encodeFunctionData(
    "createRetryableTicket",
    [
      ctx.govBridgeExecutor.address,
      0,
      options.maxSubmissionCost || wei`0.01 ether`,
      ctx.l2Tester.address,
      ctx.l2Tester.address,
      options.maxGas || 3000000,
      options.gasPriceBid || 5000000000,
      executorCalldata,
    ]
  );

  const agentCalldata = ctx.agent.interface.encodeFunctionData("execute", [
    ctx.inbox.address,
    options.callValue || wei`0.01 ether`,
    messageCalldata,
  ]);
  const agentEvmScript = encodeEVMScript(ctx.agent.address, agentCalldata);

  const newVoteCalldata =
    "0xd5db2c80" +
    abiCoder.encode(["bytes", "string"], [agentEvmScript, ""]).substring(2);
  const votingEvmScript = encodeEVMScript(ctx.voting.address, newVoteCalldata);
  const newVotingTx = await ctx.tokenMnanager.forward(votingEvmScript);

  await newVotingTx.wait();
};

export const sleep = (ms: number) =>
  new Promise((resolve) => setTimeout(resolve, ms));
