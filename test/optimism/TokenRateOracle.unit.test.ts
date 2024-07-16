import hre from "hardhat";
import { assert } from "chai";
import { BigNumber } from "ethers";
import testing, { unit } from "../../utils/testing";
import {
    TokenRateOracle__factory,
    CrossDomainMessengerStub__factory
} from "../../typechain";
import { wei } from "../../utils/wei";

unit("TokenRateOracle", ctxFactory)

  .test("state after init", async (ctx) => {
    const { tokenRateOracle, l2MessengerStub } = ctx.contracts;
    const { bridge, l1TokenBridgeEOA } = ctx.accounts;

    assert.equal(await tokenRateOracle.MESSENGER(), l2MessengerStub.address);
    assert.equal(await tokenRateOracle.L2_ERC20_TOKEN_BRIDGE(), bridge.address);
    assert.equal(await tokenRateOracle.L1_TOKEN_RATE_PUSHER(), l1TokenBridgeEOA.address);
    assert.equalBN(await tokenRateOracle.TOKEN_RATE_OUTDATED_DELAY(), 86400);

    assert.equalBN(await tokenRateOracle.latestAnswer(), 0);

    const {
        roundId_,
        answer_,
        startedAt_,
        updatedAt_,
        answeredInRound_
    } = await tokenRateOracle.latestRoundData();

    assert.equalBN(roundId_, 0);
    assert.equalBN(answer_, 0);
    assert.equalBN(startedAt_, 0);
    assert.equalBN(updatedAt_, 0);
    assert.equalBN(answeredInRound_, 0);
    assert.equalBN(await tokenRateOracle.decimals(), 18);
  })

  .test("updateRate() :: called by non-bridge account", async (ctx) => {
    const { tokenRateOracle } = ctx.contracts;
    const { stranger } = ctx.accounts;
    await assert.revertsWith(tokenRateOracle.connect(stranger).updateRate(10, 40), "ErrorNoRights(\""+stranger.address+"\")");
  })

  .test("updateRate() :: called by messenger with incorrect cross-domain sender", async (ctx) => {
    const { tokenRateOracle, l2MessengerStub } = ctx.contracts;
    const { stranger, l2MessengerStubEOA } = ctx.accounts;
    await l2MessengerStub.setXDomainMessageSender(stranger.address);
    await assert.revertsWith(tokenRateOracle.connect(l2MessengerStubEOA).updateRate(10, 40), "ErrorNoRights(\""+l2MessengerStubEOA._address+"\")");
  })

  .test("updateRate() :: incorrect time", async (ctx) => {
    const { tokenRateOracle } = ctx.contracts;
    const { bridge } = ctx.accounts;
    const { tokenRateCorrect } = ctx.constants;

    const tx0 = await tokenRateOracle.connect(bridge).updateRate(tokenRateCorrect, 1000);
    const tx1 = await tokenRateOracle.connect(bridge).updateRate(tokenRateCorrect, 20);

    await assert.emits(tokenRateOracle, tx1, "NewTokenRateOutdated", [tokenRateCorrect, 1000, 20]);
  })

  .test("updateRate() :: time in future", async (ctx) => {
    const { tokenRateOracle } = ctx.contracts;
    const { bridge } = ctx.accounts;
    const { tokenRateCorrect, blockTimestamp } = ctx.constants;

    const timeInFuture = blockTimestamp + 100000;
    await assert.revertsWith(
        tokenRateOracle.connect(bridge).updateRate(tokenRateCorrect, timeInFuture),
        "ErrorL1TimestampInFuture("+tokenRateCorrect+", "+timeInFuture+")"
    );
  })

  .test("updateRate() :: rate is out of range", async (ctx) => {
    const { tokenRateOracle } = ctx.contracts;
    const { bridge } = ctx.accounts;
    const { tokenRateTooBig, tokenRateTooSmall, blockTimestamp } = ctx.constants;

    await assert.revertsWith(
        tokenRateOracle.connect(bridge).updateRate(tokenRateTooBig, blockTimestamp),
        "ErrorTokenRateIsOutOfRange("+tokenRateTooBig+", "+blockTimestamp+")"
    );
    await assert.revertsWith(
        tokenRateOracle.connect(bridge).updateRate(tokenRateTooSmall, blockTimestamp),
        "ErrorTokenRateIsOutOfRange("+tokenRateTooSmall+", "+blockTimestamp+")"
    );
  })

  .test("updateRate() :: don't update state if values are the same", async (ctx) => {
    const { tokenRateOracle } = ctx.contracts;
    const { bridge } = ctx.accounts;
    const { tokenRateCorrect } = ctx.constants;

    const tx1 = await tokenRateOracle.connect(bridge).updateRate(tokenRateCorrect, 1000);
    await assert.emits(tokenRateOracle, tx1, "RateUpdated", [tokenRateCorrect, 1000]);

    const tx2 = await tokenRateOracle.connect(bridge).updateRate(tokenRateCorrect, 1000);
    await assert.notEmits(tokenRateOracle, tx2, "RateUpdated");
  })

  .test("updateRate() :: happy path called by bridge", async (ctx) => {
    const { tokenRateOracle } = ctx.contracts;
    const { bridge } = ctx.accounts;
    const { tokenRateCorrect, blockTimestamp } = ctx.constants;

    await tokenRateOracle.connect(bridge).updateRate(tokenRateCorrect, blockTimestamp);

    assert.equalBN(await tokenRateOracle.latestAnswer(), tokenRateCorrect);

    const {
        roundId_,
        answer_,
        startedAt_,
        updatedAt_,
        answeredInRound_
    } = await tokenRateOracle.latestRoundData();

    assert.equalBN(roundId_, blockTimestamp);
    assert.equalBN(answer_, tokenRateCorrect);
    assert.equalBN(startedAt_, blockTimestamp);
    assert.equalBN(updatedAt_, blockTimestamp);
    assert.equalBN(answeredInRound_, blockTimestamp);
    assert.equalBN(await tokenRateOracle.decimals(), 18);
  })

  .test("updateRate() :: happy path called by messenger with correct cross-domain sender", async (ctx) => {
    const { tokenRateOracle, l2MessengerStub } = ctx.contracts;
    const { l2MessengerStubEOA, l1TokenBridgeEOA } = ctx.accounts;
    const { tokenRateCorrect, blockTimestamp } = ctx.constants;

    await l2MessengerStub.setXDomainMessageSender(l1TokenBridgeEOA.address);

    await tokenRateOracle.connect(l2MessengerStubEOA).updateRate(tokenRateCorrect, blockTimestamp);

    assert.equalBN(await tokenRateOracle.latestAnswer(), tokenRateCorrect);

    const {
        roundId_,
        answer_,
        startedAt_,
        updatedAt_,
        answeredInRound_
    } = await tokenRateOracle.latestRoundData();

    assert.equalBN(roundId_, blockTimestamp);
    assert.equalBN(answer_, tokenRateCorrect);
    assert.equalBN(startedAt_, blockTimestamp);
    assert.equalBN(updatedAt_, blockTimestamp);
    assert.equalBN(answeredInRound_, blockTimestamp);
    assert.equalBN(await tokenRateOracle.decimals(), 18);
  })

  .run();

async function ctxFactory() {

    const [deployer, bridge, stranger, l1TokenBridgeEOA] = await hre.ethers.getSigners();

    const l2MessengerStub = await new CrossDomainMessengerStub__factory(
        deployer
    ).deploy({ value: wei.toBigNumber(wei`1 ether`) });
    const l2MessengerStubEOA = await testing.impersonate(l2MessengerStub.address);

    const tokenRateOracle = await new TokenRateOracle__factory(deployer).deploy(
        l2MessengerStub.address,
        bridge.address,
        l1TokenBridgeEOA.address,
        86400
    );

    const decimals = 18;
    const decimalsBN = BigNumber.from(10).pow(decimals);
    const tokenRateCorrect = BigNumber.from('12').pow(decimals - 1);
    const tokenRateTooBig = BigNumber.from('2000').pow(decimals);
    const tokenRateTooSmall = BigNumber.from('1').pow(decimals-3);

    const provider = await hre.ethers.provider;
    const blockNumber = await provider.getBlockNumber();
    const blockTimestamp = (await provider.getBlock(blockNumber)).timestamp;

    return {
      accounts: { deployer, bridge, stranger, l1TokenBridgeEOA, l2MessengerStubEOA },
      contracts: { tokenRateOracle, l2MessengerStub },
      constants: { tokenRateCorrect, tokenRateTooBig, tokenRateTooSmall, blockTimestamp }
    };
}
