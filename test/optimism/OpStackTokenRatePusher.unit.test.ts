import { ethers } from "hardhat";
import { assert } from "chai";
import { utils } from 'ethers'
import { unit } from "../../utils/testing";
import { wei } from "../../utils/wei";

import {
    OpStackTokenRatePusher__factory,
    CrossDomainMessengerStub__factory,
    ERC20BridgedStub__factory,
    ERC20WrapperStub__factory,
    ITokenRateOracle__factory,
    ITokenRatePusher__factory
} from "../../typechain";

unit("OpStackTokenRatePusher", ctxFactory)

  .test("initial state", async (ctx) => {
    const { tokenRateOracle } = ctx.accounts;
    const { opStackTokenRatePusher, l1MessengerStub, l1TokenNonRebasableStub } = ctx.contracts;

    assert.equal(await opStackTokenRatePusher.MESSENGER(), l1MessengerStub.address);
    assert.equal(await opStackTokenRatePusher.WSTETH(), l1TokenNonRebasableStub.address);
    assert.equal(await opStackTokenRatePusher.L2_TOKEN_RATE_ORACLE(), tokenRateOracle.address);
    assert.equalBN(await opStackTokenRatePusher.L2_GAS_LIMIT_FOR_PUSHING_TOKEN_RATE(), 123);
    const iTokenRatePusher = getInterfaceID(ITokenRatePusher__factory.createInterface());
    assert.isTrue(await opStackTokenRatePusher.supportsInterface(iTokenRatePusher._hex));
  })

  .test("pushTokenRate() :: success", async (ctx) => {
    const { tokenRateOracle } = ctx.accounts;
    const { l2GasLimitForPushingTokenRate } = ctx.constants;
    const { opStackTokenRatePusher, l1MessengerStub, l1TokenNonRebasableStub } = ctx.contracts;

    let tokenRate = await l1TokenNonRebasableStub.stEthPerToken();

    let tx = await opStackTokenRatePusher.pushTokenRate();

    const provider = await ethers.provider;
    const blockNumber = await provider.getBlockNumber();
    const blockTimestamp = (await provider.getBlock(blockNumber)).timestamp;

    await assert.emits(l1MessengerStub  , tx, "SentMessage", [
      tokenRateOracle.address,
      opStackTokenRatePusher.address,
      ITokenRateOracle__factory.createInterface().encodeFunctionData(
        "updateRate",
        [
          tokenRate,
          blockTimestamp
        ]
      ),
      1,
      l2GasLimitForPushingTokenRate,
    ]);
  })

  .run();

async function ctxFactory() {
    const [deployer, bridge, stranger, tokenRateOracle, l1TokenBridgeEOA] = await ethers.getSigners();

    const l1TokenRebasableStub = await new ERC20BridgedStub__factory(deployer).deploy(
      "L1 Token Rebasable",
      "L1R"
    );

    const l1TokenNonRebasableStub = await new ERC20WrapperStub__factory(deployer).deploy(
      l1TokenRebasableStub.address,
      "L1 Token Non Rebasable",
      "L1NR"
    );

    const l1MessengerStub = await new CrossDomainMessengerStub__factory(
        deployer
    ).deploy({ value: wei.toBigNumber(wei`1 ether`) });
    await l1MessengerStub.setXDomainMessageSender(l1TokenBridgeEOA.address);

    const l2GasLimitForPushingTokenRate = 123;

    const opStackTokenRatePusher = await new OpStackTokenRatePusher__factory(deployer).deploy(
        l1MessengerStub.address,
        l1TokenNonRebasableStub.address,
        tokenRateOracle.address,
        l2GasLimitForPushingTokenRate
    );

    return {
      accounts: { deployer, bridge, stranger, tokenRateOracle },
      contracts: { opStackTokenRatePusher, l1MessengerStub, l1TokenNonRebasableStub },
      constants: { l2GasLimitForPushingTokenRate }
    };
}

export function getInterfaceID(contractInterface: utils.Interface) {
    let interfaceID = ethers.constants.Zero;
    const functions: string[] = Object.keys(contractInterface.functions);
    for (let i = 0; i < functions.length; i++) {
        interfaceID = interfaceID.xor(contractInterface.getSighash(functions[i]));
    }
    return interfaceID;
}
