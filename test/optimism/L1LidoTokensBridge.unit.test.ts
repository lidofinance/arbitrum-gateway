import { assert } from "chai";
import hre, { ethers } from "hardhat";
import { BigNumber } from "ethers";
import {
    ERC20BridgedStub__factory,
    ERC20WrapperStub__factory,
    L1LidoTokensBridge__factory,
    L2ERC20ExtendedTokensBridge__factory,
    OssifiableProxy__factory,
    EmptyContractStub__factory,
    ERC20WrapperStub
} from "../../typechain";
import { JsonRpcProvider } from "@ethersproject/providers";
import { CrossDomainMessengerStub__factory } from "../../typechain/factories/CrossDomainMessengerStub__factory";
import testing, { unit } from "../../utils/testing";
import { wei } from "../../utils/wei";

unit("Optimism :: L1LidoTokensBridge", ctxFactory)

    .test("initial state", async (ctx) => {
        assert.equal(await ctx.l1TokenBridge.l2TokenBridge(), ctx.accounts.l2TokenBridgeEOA.address);
        assert.equal(await ctx.l1TokenBridge.MESSENGER(), ctx.accounts.l1MessengerStubAsEOA._address);
        assert.equal(await ctx.l1TokenBridge.L1_TOKEN_NON_REBASABLE(), ctx.stubs.l1TokenNonRebasable.address);
        assert.equal(await ctx.l1TokenBridge.L1_TOKEN_REBASABLE(), ctx.stubs.l1TokenRebasable.address);
        assert.equal(await ctx.l1TokenBridge.L2_TOKEN_NON_REBASABLE(), ctx.stubs.l2TokenNonRebasable.address);
        assert.equal(await ctx.l1TokenBridge.L2_TOKEN_REBASABLE(), ctx.stubs.l2TokenRebasable.address);
    })

    .test("depositERC20() :: deposits disabled", async (ctx) => {
        await ctx.l1TokenBridge.disableDeposits();

        assert.isFalse(await ctx.l1TokenBridge.isDepositsEnabled());

        await assert.revertsWith(
            ctx.l1TokenBridge.depositERC20(
                ctx.stubs.l1TokenNonRebasable.address,
                ctx.stubs.l2TokenNonRebasable.address,
                wei`1 ether`,
                wei`1 gwei`,
                "0x"
            ),
            "ErrorDepositsDisabled()"
        );

        await assert.revertsWith(
            ctx.l1TokenBridge.depositERC20(
                ctx.stubs.l1TokenRebasable.address,
                ctx.stubs.l2TokenRebasable.address,
                wei`1 ether`,
                wei`1 gwei`,
                "0x"
            ),
            "ErrorDepositsDisabled()"
        );
    })

    .test("depositERC20() :: wrong l1Token address", async (ctx) => {
        await assert.revertsWith(
            ctx.l1TokenBridge.depositERC20(
                ctx.accounts.stranger.address,
                ctx.stubs.l2TokenNonRebasable.address,
                wei`1 ether`,
                wei`1 gwei`,
                "0x"
            ),
            "ErrorUnsupportedL1Token()"
        );
        await assert.revertsWith(
            ctx.l1TokenBridge.depositERC20(
                ctx.accounts.stranger.address,
                ctx.stubs.l2TokenRebasable.address,
                wei`1 ether`,
                wei`1 gwei`,
                "0x"
            ),
            "ErrorUnsupportedL1Token()"
        );
    })

    .test("depositERC20() :: wrong l2Token address", async (ctx) => {
        await assert.revertsWith(
            ctx.l1TokenBridge.depositERC20(
                ctx.stubs.l1TokenNonRebasable.address,
                ctx.accounts.stranger.address,
                wei`1 ether`,
                wei`1 gwei`,
                "0x"
            ),
            "ErrorUnsupportedL2Token()"
        );
        await assert.revertsWith(
            ctx.l1TokenBridge.depositERC20(
                ctx.stubs.l1TokenRebasable.address,
                ctx.accounts.stranger.address,
                wei`1 ether`,
                wei`1 gwei`,
                "0x"
            ),
            "ErrorUnsupportedL2Token()"
        );
    })

    .test("depositERC20() :: wrong tokens combination", async (ctx) => {
        await assert.revertsWith(
            ctx.l1TokenBridge.depositERC20(
                ctx.stubs.l1TokenRebasable.address,
                ctx.stubs.l2TokenNonRebasable.address,
                wei`1 ether`,
                wei`1 gwei`,
                "0x"
            ),
            "ErrorUnsupportedL1L2TokensPair()"
        );
        await assert.revertsWith(
            ctx.l1TokenBridge.depositERC20(
                ctx.stubs.l1TokenNonRebasable.address,
                ctx.stubs.l2TokenRebasable.address,
                wei`1 ether`,
                wei`1 gwei`,
                "0x"
            ),
            "ErrorUnsupportedL1L2TokensPair()"
        );
    })

    .test("depositERC20() :: not from EOA", async (ctx) => {
        await assert.revertsWith(
            ctx.l1TokenBridge
                .connect(ctx.accounts.emptyContractAsEOA)
                .depositERC20(
                    ctx.stubs.l1TokenNonRebasable.address,
                    ctx.stubs.l2TokenNonRebasable.address,
                    wei`1 ether`,
                    wei`1 gwei`,
                    "0x"
                ),
            "ErrorSenderNotEOA()"
        );
        await assert.revertsWith(
            ctx.l1TokenBridge
                .connect(ctx.accounts.emptyContractAsEOA)
                .depositERC20(
                    ctx.stubs.l1TokenRebasable.address,
                    ctx.stubs.l2TokenRebasable.address,
                    wei`1 ether`,
                    wei`1 gwei`,
                    "0x"
                ),
            "ErrorSenderNotEOA()"
        );
    })

    .test("depositERC20() :: non-rebasable token flow", async (ctx) => {
        const {
            l1TokenBridge,
            accounts: { deployer, l2TokenBridgeEOA },
            stubs: { l1TokenNonRebasable, l2TokenNonRebasable, l1Messenger },
        } = ctx;

        const l2Gas = wei`0.99 wei`;
        const amount = wei`1 ether`;
        const data = "0xdeadbeaf";

        await l1TokenNonRebasable.approve(l1TokenBridge.address, amount);

        const deployerBalanceBefore = await l1TokenNonRebasable.balanceOf(deployer.address);
        const bridgeBalanceBefore = await l1TokenNonRebasable.balanceOf(l1TokenBridge.address);

        const tx = await l1TokenBridge.depositERC20(
            l1TokenNonRebasable.address,
            l2TokenNonRebasable.address,
            amount,
            l2Gas,
            data
        );

        const packedTokenRateAndTimestampData = await packedTokenRateAndTimestamp(ctx.provider, l1TokenNonRebasable);
        const dataToReceive = ethers.utils.hexConcat([packedTokenRateAndTimestampData, data]);

        await assert.emits(l1TokenBridge, tx, "ERC20DepositInitiated", [
            l1TokenNonRebasable.address,
            l2TokenNonRebasable.address,
            deployer.address,
            deployer.address,
            amount,
            dataToReceive,
        ]);

        await assert.emits(l1Messenger, tx, "SentMessage", [
            l2TokenBridgeEOA.address,
            l1TokenBridge.address,
            L2ERC20ExtendedTokensBridge__factory.createInterface().encodeFunctionData(
                "finalizeDeposit",
                [
                    l1TokenNonRebasable.address,
                    l2TokenNonRebasable.address,
                    deployer.address,
                    deployer.address,
                    amount,
                    dataToReceive,
                ]
            ),
            1, // message nonce
            l2Gas,
        ]);

        assert.equalBN(
            await l1TokenNonRebasable.balanceOf(deployer.address),
            deployerBalanceBefore.sub(amount)
        );

        assert.equalBN(
            await l1TokenNonRebasable.balanceOf(l1TokenBridge.address),
            bridgeBalanceBefore.add(amount)
        );
    })

    .test("depositERC20() :: rebasable token flow", async (ctx) => {
        const {
            l1TokenBridge,
            accounts: { deployer, l2TokenBridgeEOA },
            stubs: { l1TokenRebasable, l2TokenRebasable, l1TokenNonRebasable, l1Messenger },
        } = ctx;

        const l2Gas = wei`0.99 wei`;
        const amount = wei`1 ether`;
        const data = "0xdeadbeaf";
        const rate = await l1TokenNonRebasable.stEthPerToken();
        const decimalsStr = await l1TokenNonRebasable.decimals();
        const decimals = BigNumber.from(10).pow(decimalsStr);

        const amountWrapped = (wei.toBigNumber(amount)).mul(BigNumber.from(decimals)).div(rate);
        const deployerBalanceBefore = await l1TokenRebasable.balanceOf(deployer.address);
        const bridgeBalanceBefore = await l1TokenNonRebasable.balanceOf(l1TokenBridge.address);

        await l1TokenRebasable.approve(l1TokenBridge.address, amount);

        const tx = await l1TokenBridge.depositERC20(
            l1TokenRebasable.address,
            l2TokenRebasable.address,
            amount,
            l2Gas,
            data
        );

        const packedTokenRateAndTimestampData = await packedTokenRateAndTimestamp(ctx.provider, l1TokenNonRebasable);
        const dataToReceive = ethers.utils.hexConcat([packedTokenRateAndTimestampData, data]);

        await assert.emits(l1TokenBridge, tx, "ERC20DepositInitiated", [
            l1TokenRebasable.address,
            l2TokenRebasable.address,
            deployer.address,
            deployer.address,
            amount,
            dataToReceive,
        ]);

        await assert.emits(l1Messenger, tx, "SentMessage", [
            l2TokenBridgeEOA.address,
            l1TokenBridge.address,
            L2ERC20ExtendedTokensBridge__factory.createInterface().encodeFunctionData(
                "finalizeDeposit",
                [
                    l1TokenRebasable.address,
                    l2TokenRebasable.address,
                    deployer.address,
                    deployer.address,
                    amountWrapped,
                    dataToReceive,
                ]
            ),
            1, // message nonce
            l2Gas,
        ]);

        assert.equalBN(
            await l1TokenRebasable.balanceOf(deployer.address),
            deployerBalanceBefore.sub(amount)
        );

        assert.equalBN(
            await l1TokenNonRebasable.balanceOf(l1TokenBridge.address),
            bridgeBalanceBefore.add(amountWrapped)
        );
    })

    .test("depositERC20To() :: deposits disabled", async (ctx) => {
        const {
            l1TokenBridge,
            stubs: { l1TokenNonRebasable, l2TokenNonRebasable, l1TokenRebasable, l2TokenRebasable },
            accounts: { recipient },
        } = ctx;
        await l1TokenBridge.disableDeposits();

        assert.isFalse(await l1TokenBridge.isDepositsEnabled());

        await assert.revertsWith(
            l1TokenBridge.depositERC20To(
                l1TokenNonRebasable.address,
                l2TokenNonRebasable.address,
                recipient.address,
                wei`1 ether`,
                wei`1 gwei`,
                "0x"
            ),
            "ErrorDepositsDisabled()"
        );

        await assert.revertsWith(
            l1TokenBridge.depositERC20To(
                l1TokenRebasable.address,
                l2TokenRebasable.address,
                recipient.address,
                wei`1 ether`,
                wei`1 gwei`,
                "0x"
            ),
            "ErrorDepositsDisabled()"
        );
    })

    .test("depositERC20To() :: wrong l1Token address", async (ctx) => {
        const {
            l1TokenBridge,
            stubs: { l2TokenNonRebasable, l2TokenRebasable },
            accounts: { recipient, stranger },
        } = ctx;

        await assert.revertsWith(
            l1TokenBridge.depositERC20To(
                stranger.address,
                l2TokenNonRebasable.address,
                recipient.address,
                wei`1 ether`,
                wei`1 gwei`,
                "0x"
            ),
            "ErrorUnsupportedL1Token()"
        );
        await assert.revertsWith(
            l1TokenBridge.depositERC20To(
                stranger.address,
                l2TokenRebasable.address,
                recipient.address,
                wei`1 ether`,
                wei`1 gwei`,
                "0x"
            ),
            "ErrorUnsupportedL1Token()"
        );
    })

    .test("depositERC20To() :: wrong l2Token address", async (ctx) => {
        const {
            l1TokenBridge,
            stubs: { l2TokenNonRebasable, l2TokenRebasable },
            accounts: { recipient, stranger },
        } = ctx;

        await assert.revertsWith(
            l1TokenBridge.depositERC20To(
                stranger.address,
                l2TokenNonRebasable.address,
                recipient.address,
                wei`1 ether`,
                wei`1 gwei`,
                "0x"
            ),
            "ErrorUnsupportedL1Token()"
        );
        await assert.revertsWith(
            l1TokenBridge.depositERC20To(
                stranger.address,
                l2TokenRebasable.address,
                recipient.address,
                wei`1 ether`,
                wei`1 gwei`,
                "0x"
            ),
            "ErrorUnsupportedL1Token()"
        );
    })

    .test("depositERC20To() :: wrong tokens combination", async (ctx) => {
        const {
            l1TokenBridge,
            stubs: { l1TokenNonRebasable, l1TokenRebasable, l2TokenNonRebasable, l2TokenRebasable },
            accounts: { recipient },
        } = ctx;

        await assert.revertsWith(
            l1TokenBridge.depositERC20To(
                l1TokenNonRebasable.address,
                l2TokenRebasable.address,
                recipient.address,
                wei`1 ether`,
                wei`1 gwei`,
                "0x"
            ),
            "ErrorUnsupportedL1L2TokensPair()"
        );
        await assert.revertsWith(
            l1TokenBridge.depositERC20To(
                l1TokenRebasable.address,
                l2TokenNonRebasable.address,
                recipient.address,
                wei`1 ether`,
                wei`1 gwei`,
                "0x"
            ),
            "ErrorUnsupportedL1L2TokensPair()"
        );
    })

    .test("depositERC20To() :: recipient is zero address", async (ctx) => {
        const {
            l1TokenBridge,
            stubs: { l1TokenNonRebasable, l2TokenNonRebasable, l1TokenRebasable, l2TokenRebasable }
        } = ctx;

        await assert.revertsWith(
            l1TokenBridge.depositERC20To(
                l1TokenNonRebasable.address,
                l2TokenNonRebasable.address,
                ethers.constants.AddressZero,
                wei`1 ether`,
                wei`1 gwei`,
                "0x"
            ),
            "ErrorAccountIsZeroAddress()"
        );
        await assert.revertsWith(
            l1TokenBridge.depositERC20To(
                l1TokenRebasable.address,
                l2TokenRebasable.address,
                ethers.constants.AddressZero,
                wei`1 ether`,
                wei`1 gwei`,
                "0x"
            ),
            "ErrorAccountIsZeroAddress()"
        );
    })

    .test("depositERC20To() :: non-rebasable token flow", async (ctx) => {
        const {
            l1TokenBridge,
            accounts: { deployer, l2TokenBridgeEOA, recipient },
            stubs: { l1TokenNonRebasable, l2TokenNonRebasable, l1Messenger },
        } = ctx;

        const l2Gas = wei`0.99 wei`;
        const amount = wei`1 ether`;
        const data = "0x";

        await l1TokenNonRebasable.approve(l1TokenBridge.address, amount);

        const deployerBalanceBefore = await l1TokenNonRebasable.balanceOf(deployer.address);
        const bridgeBalanceBefore = await l1TokenNonRebasable.balanceOf(l1TokenBridge.address);

        const tx = await l1TokenBridge.depositERC20To(
            l1TokenNonRebasable.address,
            l2TokenNonRebasable.address,
            recipient.address,
            amount,
            l2Gas,
            data
        );

        const packedTokenRateAndTimestampData = await packedTokenRateAndTimestamp(ctx.provider, l1TokenNonRebasable);
        const dataToReceive = ethers.utils.hexConcat([packedTokenRateAndTimestampData, data]);

        await assert.emits(l1TokenBridge, tx, "ERC20DepositInitiated", [
            l1TokenNonRebasable.address,
            l2TokenNonRebasable.address,
            deployer.address,
            recipient.address,
            amount,
            dataToReceive,
        ]);

        await assert.emits(l1Messenger, tx, "SentMessage", [
            l2TokenBridgeEOA.address,
            l1TokenBridge.address,
            L2ERC20ExtendedTokensBridge__factory.createInterface().encodeFunctionData(
                "finalizeDeposit",
                [
                    l1TokenNonRebasable.address,
                    l2TokenNonRebasable.address,
                    deployer.address,
                    recipient.address,
                    amount,
                    dataToReceive,
                ]
            ),
            1, // message nonce
            l2Gas,
        ]);

        assert.equalBN(
            await l1TokenNonRebasable.balanceOf(deployer.address),
            deployerBalanceBefore.sub(amount)
        );

        assert.equalBN(
            await l1TokenNonRebasable.balanceOf(l1TokenBridge.address),
            bridgeBalanceBefore.add(amount)
        );
    })

    .test("depositERC20To() :: rebasable token flow", async (ctx) => {
        const {
            l1TokenBridge,
            accounts: { deployer, l2TokenBridgeEOA, recipient },
            stubs: { l1TokenNonRebasable, l2TokenNonRebasable, l1TokenRebasable, l2TokenRebasable, l1Messenger },
        } = ctx;

        const l2Gas = wei`0.99 wei`;
        const amount = wei`1 ether`;
        const data = "0x";

        const rate = await l1TokenNonRebasable.stEthPerToken();
        const decimalsStr = await l1TokenNonRebasable.decimals();
        const decimals = BigNumber.from(10).pow(decimalsStr);

        const amountWrapped = (wei.toBigNumber(amount)).mul(BigNumber.from(decimals)).div(rate);

        await l1TokenRebasable.approve(l1TokenBridge.address, amount);

        const deployerBalanceBefore = await l1TokenRebasable.balanceOf(deployer.address);
        const bridgeBalanceBefore = await l1TokenNonRebasable.balanceOf(l1TokenBridge.address);

        const tx = await l1TokenBridge.depositERC20To(
            l1TokenRebasable.address,
            l2TokenRebasable.address,
            recipient.address,
            amount,
            l2Gas,
            data
        );

        const packedTokenRateAndTimestampData = await packedTokenRateAndTimestamp(ctx.provider, l1TokenNonRebasable);
        const dataToReceive = ethers.utils.hexConcat([packedTokenRateAndTimestampData, data]);

        await assert.emits(l1TokenBridge, tx, "ERC20DepositInitiated", [
            l1TokenRebasable.address,
            l2TokenRebasable.address,
            deployer.address,
            recipient.address,
            amount,
            dataToReceive,
        ]);

        await assert.emits(l1Messenger, tx, "SentMessage", [
            l2TokenBridgeEOA.address,
            l1TokenBridge.address,
            L2ERC20ExtendedTokensBridge__factory.createInterface().encodeFunctionData(
                "finalizeDeposit",
                [
                    l1TokenRebasable.address,
                    l2TokenRebasable.address,
                    deployer.address,
                    recipient.address,
                    amountWrapped,
                    dataToReceive,
                ]
            ),
            1, // message nonce
            l2Gas,
        ]);

        assert.equalBN(
            await l1TokenRebasable.balanceOf(deployer.address),
            deployerBalanceBefore.sub(amount)
        );

        assert.equalBN(
            await l1TokenNonRebasable.balanceOf(l1TokenBridge.address),
            bridgeBalanceBefore.add(amountWrapped)
        );
    })

    .test(
        "finalizeERC20Withdrawal() :: withdrawals are disabled",
        async (ctx) => {
            const {
                l1TokenBridge,
                stubs: { l1TokenNonRebasable, l2TokenNonRebasable, l1TokenRebasable, l2TokenRebasable },
                accounts: { deployer, recipient, l2TokenBridgeEOA },
            } = ctx;
            await l1TokenBridge.disableWithdrawals();

            assert.isFalse(await l1TokenBridge.isWithdrawalsEnabled());

            await assert.revertsWith(
                l1TokenBridge
                    .connect(l2TokenBridgeEOA)
                    .finalizeERC20Withdrawal(
                        l1TokenNonRebasable.address,
                        l2TokenNonRebasable.address,
                        deployer.address,
                        recipient.address,
                        wei`1 ether`,
                        "0x"
                    ),
                "ErrorWithdrawalsDisabled()"
            );
            await assert.revertsWith(
                l1TokenBridge
                    .connect(l2TokenBridgeEOA)
                    .finalizeERC20Withdrawal(
                        l1TokenRebasable.address,
                        l2TokenRebasable.address,
                        deployer.address,
                        recipient.address,
                        wei`1 ether`,
                        "0x"
                    ),
                "ErrorWithdrawalsDisabled()"
            );
        }
    )

    .test("finalizeERC20Withdrawal() :: wrong l1Token", async (ctx) => {
        const {
            l1TokenBridge,
            stubs: { l2TokenNonRebasable, l2TokenRebasable, l1Messenger },
            accounts: { deployer, recipient, l1MessengerStubAsEOA, stranger, l2TokenBridgeEOA },
        } = ctx;

        await l1Messenger.setXDomainMessageSender(l2TokenBridgeEOA.address);

        await assert.revertsWith(
            l1TokenBridge
                .connect(l1MessengerStubAsEOA)
                .finalizeERC20Withdrawal(
                    stranger.address,
                    l2TokenNonRebasable.address,
                    deployer.address,
                    recipient.address,
                    wei`1 ether`,
                    "0x"
                ),
            "ErrorUnsupportedL1Token()"
        );

        await assert.revertsWith(
            l1TokenBridge
                .connect(l1MessengerStubAsEOA)
                .finalizeERC20Withdrawal(
                    stranger.address,
                    l2TokenRebasable.address,
                    deployer.address,
                    recipient.address,
                    wei`1 ether`,
                    "0x"
                ),
            "ErrorUnsupportedL1Token()"
        );
    })

    .test("finalizeERC20Withdrawal() :: wrong l2Token", async (ctx) => {
        const {
            l1TokenBridge,
            stubs: { l1TokenNonRebasable, l1TokenRebasable, l1Messenger },
            accounts: { deployer, recipient, l2TokenBridgeEOA, l1MessengerStubAsEOA, stranger },
        } = ctx;

        await l1Messenger.setXDomainMessageSender(l2TokenBridgeEOA.address);

        await assert.revertsWith(
            l1TokenBridge
                .connect(l1MessengerStubAsEOA)
                .finalizeERC20Withdrawal(
                    l1TokenNonRebasable.address,
                    stranger.address,
                    deployer.address,
                    recipient.address,
                    wei`1 ether`,
                    "0x"
                ),
            "ErrorUnsupportedL2Token()"
        );

        await assert.revertsWith(
            l1TokenBridge
                .connect(l1MessengerStubAsEOA)
                .finalizeERC20Withdrawal(
                    l1TokenRebasable.address,
                    stranger.address,
                    deployer.address,
                    recipient.address,
                    wei`1 ether`,
                    "0x"
                ),
            "ErrorUnsupportedL2Token()"
        );
    })

    .test("finalizeERC20Withdrawal() :: wrong token combination", async (ctx) => {
        const {
            l1TokenBridge,
            stubs: { l1TokenNonRebasable, l1TokenRebasable, l2TokenNonRebasable, l2TokenRebasable, l1Messenger },
            accounts: { deployer, recipient, l2TokenBridgeEOA, l1MessengerStubAsEOA },
        } = ctx;
        await l1Messenger.setXDomainMessageSender(l2TokenBridgeEOA.address);

        await assert.revertsWith(
            l1TokenBridge
                .connect(l1MessengerStubAsEOA)
                .finalizeERC20Withdrawal(
                    l1TokenNonRebasable.address,
                    l2TokenRebasable.address,
                    deployer.address,
                    recipient.address,
                    wei`1 ether`,
                    "0x"
                ),
            "ErrorUnsupportedL1L2TokensPair()"
        );

        await assert.revertsWith(
            l1TokenBridge
                .connect(l1MessengerStubAsEOA)
                .finalizeERC20Withdrawal(
                    l1TokenRebasable.address,
                    l2TokenNonRebasable.address,
                    deployer.address,
                    recipient.address,
                    wei`1 ether`,
                    "0x"
                ),
            "ErrorUnsupportedL1L2TokensPair()"
        );
    })

    .test("finalizeERC20Withdrawal() :: unauthorized messenger", async (ctx) => {
        const {
            l1TokenBridge,
            stubs: { l1TokenNonRebasable, l2TokenNonRebasable, l1TokenRebasable, l2TokenRebasable },
            accounts: { deployer, recipient, stranger },
        } = ctx;

        await assert.revertsWith(
            l1TokenBridge
                .connect(stranger)
                .finalizeERC20Withdrawal(
                    l1TokenNonRebasable.address,
                    l2TokenNonRebasable.address,
                    deployer.address,
                    recipient.address,
                    wei`1 ether`,
                    "0x"
                ),
            "ErrorUnauthorizedMessenger()"
        );
        await assert.revertsWith(
            l1TokenBridge
                .connect(stranger)
                .finalizeERC20Withdrawal(
                    l1TokenRebasable.address,
                    l2TokenRebasable.address,
                    deployer.address,
                    recipient.address,
                    wei`1 ether`,
                    "0x"
                ),
            "ErrorUnauthorizedMessenger()"
        );
    })

    .test("finalizeERC20Withdrawal() :: wrong cross domain sender", async (ctx) => {
        const {
            l1TokenBridge,
            stubs: { l1TokenNonRebasable, l2TokenNonRebasable, l1TokenRebasable, l2TokenRebasable, l1Messenger },
            accounts: { deployer, recipient, stranger, l1MessengerStubAsEOA },
        } = ctx;

        await l1Messenger.setXDomainMessageSender(stranger.address);

        await assert.revertsWith(
            l1TokenBridge
                .connect(l1MessengerStubAsEOA)
                .finalizeERC20Withdrawal(
                    l1TokenNonRebasable.address,
                    l2TokenNonRebasable.address,
                    deployer.address,
                    recipient.address,
                    wei`1 ether`,
                    "0x"
                ),
            "ErrorWrongCrossDomainSender()"
        );
        await assert.revertsWith(
            l1TokenBridge
                .connect(l1MessengerStubAsEOA)
                .finalizeERC20Withdrawal(
                    l1TokenRebasable.address,
                    l2TokenRebasable.address,
                    deployer.address,
                    recipient.address,
                    wei`1 ether`,
                    "0x"
                ),
            "ErrorWrongCrossDomainSender()"
        );
    })

    .test("finalizeERC20Withdrawal() :: non-rebasable token flow", async (ctx) => {
        const {
            l1TokenBridge,
            stubs: { l1TokenNonRebasable, l2TokenNonRebasable, l1Messenger },
            accounts: { deployer, recipient, l1MessengerStubAsEOA, l2TokenBridgeEOA },
        } = ctx;

        await l1Messenger.setXDomainMessageSender(l2TokenBridgeEOA.address);

        const amount = wei`1 ether`;
        const data = "0xdeadbeaf";
        const bridgeBalanceBefore = await l1TokenNonRebasable.balanceOf(l1TokenBridge.address);

        const tx = await l1TokenBridge
            .connect(l1MessengerStubAsEOA)
            .finalizeERC20Withdrawal(
                l1TokenNonRebasable.address,
                l2TokenNonRebasable.address,
                deployer.address,
                recipient.address,
                amount,
                data
            );

        await assert.emits(l1TokenBridge, tx, "ERC20WithdrawalFinalized", [
            l1TokenNonRebasable.address,
            l2TokenNonRebasable.address,
            deployer.address,
            recipient.address,
            amount,
            data,
        ]);

        assert.equalBN(await l1TokenNonRebasable.balanceOf(recipient.address), amount);
        assert.equalBN(
            await l1TokenNonRebasable.balanceOf(l1TokenBridge.address),
            bridgeBalanceBefore.sub(amount)
        );
    })

    .test("finalizeERC20Withdrawal() :: rebasable token flow", async (ctx) => {
        const {
            l1TokenBridge,
            stubs: { l1TokenRebasable, l2TokenRebasable, l1TokenNonRebasable, l2TokenNonRebasable, l1Messenger },
            accounts: { deployer, recipient, l1MessengerStubAsEOA, l2TokenBridgeEOA },
        } = ctx;

        await l1Messenger.setXDomainMessageSender(l2TokenBridgeEOA.address);
        await l1TokenRebasable.transfer(l1TokenNonRebasable.address, wei`100 ether`);

        const amount = wei`1 ether`;
        const data = "0xdeadbeaf";
        const rate = await l1TokenNonRebasable.stEthPerToken();
        const decimalsStr = await l1TokenNonRebasable.decimals();
        const decimals = BigNumber.from(10).pow(decimalsStr);
        const amountUnwrapped = (wei.toBigNumber(amount)).mul(rate).div(BigNumber.from(decimals));
        const bridgeBalanceBefore = await l1TokenRebasable.balanceOf(l1TokenBridge.address);

        const tx = await l1TokenBridge
            .connect(l1MessengerStubAsEOA)
            .finalizeERC20Withdrawal(
                l1TokenRebasable.address,
                l2TokenRebasable.address,
                deployer.address,
                recipient.address,
                amount,
                data
            );

        await assert.emits(l1TokenBridge, tx, "ERC20WithdrawalFinalized", [
            l1TokenRebasable.address,
            l2TokenRebasable.address,
            deployer.address,
            recipient.address,
            amountUnwrapped,
            data,
        ]);

        assert.equalBN(await l1TokenRebasable.balanceOf(recipient.address), amountUnwrapped);
        assert.equalBN(
            await l1TokenNonRebasable.balanceOf(l1TokenBridge.address),
            bridgeBalanceBefore.sub(amount)
        );
    })

    .test("finalizeERC20Withdrawal() :: zero amount of rebasable token", async (ctx) => {
        const {
            l1TokenBridge,
            stubs: { l1TokenRebasable, l2TokenRebasable, l1Messenger },
            accounts: { deployer, recipient, l1MessengerStubAsEOA, l2TokenBridgeEOA },
        } = ctx;

        await l1Messenger.setXDomainMessageSender(l2TokenBridgeEOA.address);

        const data = "0xdeadbeaf";
        const recipientBalanceBefore = await l1TokenRebasable.balanceOf(recipient.address);
        const bridgeBalanceBefore = await l1TokenRebasable.balanceOf(l1TokenBridge.address);

        const tx = await l1TokenBridge
            .connect(l1MessengerStubAsEOA)
            .finalizeERC20Withdrawal(
                l1TokenRebasable.address,
                l2TokenRebasable.address,
                deployer.address,
                recipient.address,
                0,
                data
            );

        await assert.emits(l1TokenBridge, tx, "ERC20WithdrawalFinalized", [
            l1TokenRebasable.address,
            l2TokenRebasable.address,
            deployer.address,
            recipient.address,
            0,
            data,
        ]);

        assert.equalBN(await l1TokenRebasable.balanceOf(recipient.address), recipientBalanceBefore);
        assert.equalBN(await l1TokenRebasable.balanceOf(l1TokenBridge.address), bridgeBalanceBefore);
    })

    .test("finalizeERC20Withdrawal() :: zero amount of non-rebasable token", async (ctx) => {
        const {
            l1TokenBridge,
            stubs: { l1TokenNonRebasable, l2TokenNonRebasable, l1Messenger },
            accounts: { deployer, recipient, l1MessengerStubAsEOA, l2TokenBridgeEOA },
        } = ctx;

        await l1Messenger.setXDomainMessageSender(l2TokenBridgeEOA.address);

        const data = "0xdeadbeaf";
        const recipientBalanceBefore = await l1TokenNonRebasable.balanceOf(recipient.address);
        const bridgeBalanceBefore = await l1TokenNonRebasable.balanceOf(l1TokenBridge.address);

        const tx = await l1TokenBridge
            .connect(l1MessengerStubAsEOA)
            .finalizeERC20Withdrawal(
                l1TokenNonRebasable.address,
                l2TokenNonRebasable.address,
                deployer.address,
                recipient.address,
                0,
                data
            );

        await assert.emits(l1TokenBridge, tx, "ERC20WithdrawalFinalized", [
            l1TokenNonRebasable.address,
            l2TokenNonRebasable.address,
            deployer.address,
            recipient.address,
            0,
            data,
        ]);

        assert.equalBN(await l1TokenNonRebasable.balanceOf(recipient.address), recipientBalanceBefore);
        assert.equalBN(await l1TokenNonRebasable.balanceOf(l1TokenBridge.address), bridgeBalanceBefore);
    })

    .run();

async function ctxFactory() {
    const [deployer, l2TokenBridgeEOA, stranger, recipient] =
        await hre.ethers.getSigners();

    const provider = await hre.ethers.provider;

    const l1MessengerStub = await new CrossDomainMessengerStub__factory(
        deployer
    ).deploy({ value: wei.toBigNumber(wei`1 ether`) });

    const l1TokenRebasableStub = await new ERC20BridgedStub__factory(deployer).deploy(
        "L1 Token Rebasable",
        "L1R"
    );

    const l1TokenNonRebasableStub = await new ERC20WrapperStub__factory(deployer).deploy(
        l1TokenRebasableStub.address,
        "L1 Token Non Rebasable",
        "L1NR"
    );

    const l2TokenNonRebasableStub = await new ERC20BridgedStub__factory(deployer).deploy(
        "L2 Token Non Rebasable",
        "L2NR"
    );

    const l2TokenRebasableStub = await new ERC20WrapperStub__factory(deployer).deploy(
        l2TokenNonRebasableStub.address,
        "L2 Token Rebasable",
        "L2R"
    );

    const emptyContract = await new EmptyContractStub__factory(deployer).deploy({
        value: wei.toBigNumber(wei`1 ether`),
    });
    const emptyContractAsEOA = await testing.impersonate(emptyContract.address);

    const l1MessengerStubAsEOA = await testing.impersonate(
        l1MessengerStub.address
    );

    const l1TokenBridgeImpl = await new L1LidoTokensBridge__factory(
        deployer
    ).deploy(
        l1MessengerStub.address,
        l2TokenBridgeEOA.address,
        l1TokenNonRebasableStub.address,
        l1TokenRebasableStub.address,
        l2TokenNonRebasableStub.address,
        l2TokenRebasableStub.address
    );

    const l1TokenBridgeProxy = await new OssifiableProxy__factory(
        deployer
    ).deploy(
        l1TokenBridgeImpl.address,
        deployer.address,
        l1TokenBridgeImpl.interface.encodeFunctionData("initialize", [
            deployer.address
        ])
    );

    const l1TokenBridge = L1LidoTokensBridge__factory.connect(
        l1TokenBridgeProxy.address,
        deployer
    );

    await l1TokenNonRebasableStub.transfer(l1TokenBridge.address, wei`100 ether`);
    await l1TokenRebasableStub.transfer(l1TokenBridge.address, wei`100 ether`);

    const roles = await Promise.all([
        l1TokenBridge.DEPOSITS_ENABLER_ROLE(),
        l1TokenBridge.DEPOSITS_DISABLER_ROLE(),
        l1TokenBridge.WITHDRAWALS_ENABLER_ROLE(),
        l1TokenBridge.WITHDRAWALS_DISABLER_ROLE(),
    ]);

    for (const role of roles) {
        await l1TokenBridge.grantRole(role, deployer.address);
    }

    await l1TokenBridge.enableDeposits();
    await l1TokenBridge.enableWithdrawals();

    return {
        provider: provider,
        accounts: {
            deployer,
            stranger,
            l2TokenBridgeEOA,
            emptyContractAsEOA,
            recipient,
            l1MessengerStubAsEOA,
        },
        stubs: {
            l1TokenNonRebasable: l1TokenNonRebasableStub,
            l1TokenRebasable: l1TokenRebasableStub,
            l2TokenNonRebasable: l2TokenNonRebasableStub,
            l2TokenRebasable: l2TokenRebasableStub,
            l1Messenger: l1MessengerStub,
        },
        l1TokenBridge,
    };
}

async function packedTokenRateAndTimestamp(l1Provider: JsonRpcProvider, l1Token: ERC20WrapperStub) {
    const stEthPerToken = await l1Token.stEthPerToken();
    const blockNumber = await l1Provider.getBlockNumber();
    const blockTimestamp = (await l1Provider.getBlock(blockNumber)).timestamp;
    const stEthPerTokenStr = ethers.utils.hexZeroPad(stEthPerToken.toHexString(), 12);
    const blockTimestampStr = ethers.utils.hexZeroPad(ethers.utils.hexlify(blockTimestamp), 5);
    return ethers.utils.hexConcat([stEthPerTokenStr, blockTimestampStr]);
}
