import hre, { ethers } from "hardhat";
import {
    ERC20BridgedStub__factory,
    ERC20WrapperStub__factory,
    TokenRateOracle__factory,
    ERC20RebasableBridged__factory,
    L1LidoTokensBridge__factory,
    L2ERC20ExtendedTokensBridge__factory,
    OssifiableProxy__factory,
    EmptyContractStub__factory,
    CrossDomainMessengerStub__factory,
    L2ERC20ExtendedTokensBridge
} from "../../typechain";
import testing, { unit } from "../../utils/testing";
import { wei } from "../../utils/wei";
import { assert } from "chai";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { getContractAddress } from "ethers/lib/utils";
import { JsonRpcProvider } from "@ethersproject/providers";
import { BigNumber } from "ethers";

unit("Optimism:: L2ERC20ExtendedTokensBridge", ctxFactory)
    .test("initial state", async (ctx) => {
        assert.equal(await ctx.l2TokenBridge.l1TokenBridge(), ctx.accounts.l1TokenBridgeEOA.address);
        assert.equal(await ctx.l2TokenBridge.MESSENGER(), ctx.accounts.l2MessengerStubEOA._address);
        assert.equal(await ctx.l2TokenBridge.L1_TOKEN_NON_REBASABLE(), ctx.stubs.l1TokenNonRebasable.address);
        assert.equal(await ctx.l2TokenBridge.L1_TOKEN_REBASABLE(), ctx.stubs.l1TokenRebasable.address);
        assert.equal(await ctx.l2TokenBridge.L2_TOKEN_NON_REBASABLE(), ctx.stubs.l2TokenNonRebasable.address);
        assert.equal(await ctx.l2TokenBridge.L2_TOKEN_REBASABLE(), ctx.stubs.l2TokenRebasable.address);
    })

    .test("withdraw() :: withdrawals disabled", async (ctx) => {
        const {
            l2TokenBridge,
            stubs: { l2TokenNonRebasable, l2TokenRebasable },
        } = ctx;

        await ctx.l2TokenBridge.disableWithdrawals();

        assert.isFalse(await ctx.l2TokenBridge.isWithdrawalsEnabled());

        await assert.revertsWith(
            l2TokenBridge.withdraw(
                l2TokenNonRebasable.address,
                wei`1 ether`,
                wei`1 gwei`,
                "0x"
            ),
            "ErrorWithdrawalsDisabled()"
        );

        await assert.revertsWith(
            l2TokenBridge.withdraw(
                l2TokenRebasable.address,
                wei`1 ether`,
                wei`1 gwei`,
                "0x"
            ),
            "ErrorWithdrawalsDisabled()"
        );
    })

    .test("withdraw() :: unsupported l2Token", async (ctx) => {
        const {
            l2TokenBridge,
            accounts: { stranger },
        } = ctx;
        await assert.revertsWith(
            l2TokenBridge.withdraw(stranger.address, wei`1 ether`, wei`1 gwei`, "0x"),
            "ErrorUnsupportedL2Token()"
        );
    })

    .test("withdraw() :: not from EOA", async (ctx) => {
        const {
            l2TokenBridge,
            accounts: { emptyContractEOA },
            stubs: { l2TokenRebasable, l2TokenNonRebasable },
        } = ctx;

        await assert.revertsWith(
            l2TokenBridge
                .connect(emptyContractEOA)
                .withdraw(
                    l2TokenNonRebasable.address,
                    wei`1 ether`,
                    wei`1 gwei`,
                    "0x"
                ),
            "ErrorSenderNotEOA()"
        );
        await assert.revertsWith(
            l2TokenBridge
                .connect(emptyContractEOA)
                .withdraw(
                    l2TokenRebasable.address,
                    wei`1 ether`,
                    wei`1 gwei`,
                    "0x"
                ),
            "ErrorSenderNotEOA()"
        );
    })

    .test("withdraw() :: non-rebasable token flow", async (ctx) => {
        const {
            l2TokenBridge,
            accounts: { deployer, l1TokenBridgeEOA },
            stubs: {
                l2Messenger,
                l1TokenNonRebasable,
                l2TokenNonRebasable,
            },
        } = ctx;

        const deployerBalanceBefore = await l2TokenNonRebasable.balanceOf(deployer.address);
        const totalSupplyBefore = await l2TokenNonRebasable.totalSupply();

        const amount = wei`1 ether`;
        const l1Gas = wei`1 wei`;
        const data = "0xdeadbeaf";

        const tx = await l2TokenBridge.withdraw(
            l2TokenNonRebasable.address,
            amount,
            l1Gas,
            data
        );

        await assert.emits(l2TokenBridge, tx, "WithdrawalInitiated", [
            l1TokenNonRebasable.address,
            l2TokenNonRebasable.address,
            deployer.address,
            deployer.address,
            amount,
            data,
        ]);

        await assert.emits(l2Messenger, tx, "SentMessage", [
            l1TokenBridgeEOA.address,
            l2TokenBridge.address,
            L1LidoTokensBridge__factory.createInterface().encodeFunctionData(
                "finalizeERC20Withdrawal",
                [
                    l1TokenNonRebasable.address,
                    l2TokenNonRebasable.address,
                    deployer.address,
                    deployer.address,
                    amount,
                    data,
                ]
            ),
            1, // message nonce
            l1Gas,
        ]);

        assert.equalBN(
            await l2TokenNonRebasable.balanceOf(deployer.address),
            deployerBalanceBefore.sub(amount)
        );

        assert.equalBN(
            await l2TokenNonRebasable.totalSupply(),
            totalSupplyBefore.sub(amount)
        );
    })

    .test("withdraw() :: rebasable token flow", async (ctx) => {
        const {
            l2TokenBridge,
            accounts: { deployer, l1TokenBridgeEOA, l2MessengerStubEOA, recipient },
            stubs: {
                l2Messenger,
                l1TokenRebasable,
                l2TokenRebasable
            },
        } = ctx;

        const amountToDeposit = wei`1 ether`;
        const amountToWithdraw = wei.toBigNumber(amountToDeposit).mul(ctx.exchangeRate).div(ctx.decimalsBN);
        const l1Gas = wei`1 wei`;
        const data = "0xdeadbeaf";
        const provider = await hre.ethers.provider;
        const packedTokenRateAndTimestampData = await packedTokenRateAndTimestamp(provider, ctx.exchangeRate);

        const tx1 = await l2TokenBridge
            .connect(l2MessengerStubEOA)
            .finalizeDeposit(
                l1TokenRebasable.address,
                l2TokenRebasable.address,
                deployer.address,
                recipient.address,
                amountToDeposit,
                packedTokenRateAndTimestampData
            );

        const recipientBalanceBefore = await l2TokenRebasable.balanceOf(recipient.address);
        const totalSupplyBefore = await l2TokenRebasable.totalSupply();

        const tx = await l2TokenBridge.connect(recipient).withdraw(
            l2TokenRebasable.address,
            amountToWithdraw,
            l1Gas,
            data
        );

        await assert.emits(l2TokenBridge, tx, "WithdrawalInitiated", [
            l1TokenRebasable.address,
            l2TokenRebasable.address,
            recipient.address,
            recipient.address,
            amountToWithdraw,
            data,
        ]);

        await assert.emits(l2Messenger, tx, "SentMessage", [
            l1TokenBridgeEOA.address,
            l2TokenBridge.address,
            L1LidoTokensBridge__factory.createInterface().encodeFunctionData(
                "finalizeERC20Withdrawal",
                [
                    l1TokenRebasable.address,
                    l2TokenRebasable.address,
                    recipient.address,
                    recipient.address,
                    amountToDeposit,
                    data,
                ]
            ),
            1, // message nonce
            l1Gas,
        ]);

        assert.equalBN(
            await l2TokenRebasable.balanceOf(deployer.address),
            recipientBalanceBefore.sub(amountToWithdraw)
        );

        assert.equalBN(
            await l2TokenRebasable.totalSupply(),
            totalSupplyBefore.sub(amountToWithdraw)
        );
    })

    .test("withdraw() :: zero rebasable tokens", async (ctx) => {
        const {
            l2TokenBridge,
            accounts: { deployer, l1TokenBridgeEOA, recipient },
            stubs: {
                l2Messenger,
                l1TokenRebasable,
                l2TokenRebasable
            },
        } = ctx;

        await pushTokenRate(ctx);

        const l1Gas = wei`1 wei`;
        const data = "0xdeadbeaf";
        const recipientBalanceBefore = await l2TokenRebasable.balanceOf(recipient.address);
        const totalSupplyBefore = await l2TokenRebasable.totalSupply();

        const tx = await l2TokenBridge
            .connect(recipient)
            .withdraw(
                l2TokenRebasable.address,
                0,
                l1Gas,
                data);

        await assert.emits(l2TokenBridge, tx, "WithdrawalInitiated", [
            l1TokenRebasable.address,
            l2TokenRebasable.address,
            recipient.address,
            recipient.address,
            0,
            data,
        ]);

        await assert.emits(l2Messenger, tx, "SentMessage", [
            l1TokenBridgeEOA.address,
            l2TokenBridge.address,
            L1LidoTokensBridge__factory.createInterface().encodeFunctionData(
                "finalizeERC20Withdrawal",
                [
                    l1TokenRebasable.address,
                    l2TokenRebasable.address,
                    recipient.address,
                    recipient.address,
                    0,
                    data,
                ]
            ),
            1, // message nonce
            l1Gas,
        ]);

        assert.equalBN(await l2TokenRebasable.balanceOf(deployer.address), recipientBalanceBefore);
        assert.equalBN(await l2TokenRebasable.totalSupply(), totalSupplyBefore);
    })

    .test("withdraw() :: zero non-rebasable tokens", async (ctx) => {
        const {
            l2TokenBridge,
            accounts: { deployer, l1TokenBridgeEOA, recipient },
            stubs: {
                l2Messenger,
                l1TokenNonRebasable,
                l2TokenNonRebasable
            },
        } = ctx;

        await pushTokenRate(ctx);

        const l1Gas = wei`1 wei`;
        const data = "0xdeadbeaf";
        const recipientBalanceBefore = await l2TokenNonRebasable.balanceOf(recipient.address);
        const totalSupplyBefore = await l2TokenNonRebasable.totalSupply();

        const tx = await l2TokenBridge
            .connect(recipient)
            .withdraw(
                l2TokenNonRebasable.address,
                0,
                l1Gas,
                data);

        await assert.emits(l2TokenBridge, tx, "WithdrawalInitiated", [
            l1TokenNonRebasable.address,
            l2TokenNonRebasable.address,
            recipient.address,
            recipient.address,
            0,
            data,
        ]);

        await assert.emits(l2Messenger, tx, "SentMessage", [
            l1TokenBridgeEOA.address,
            l2TokenBridge.address,
            L1LidoTokensBridge__factory.createInterface().encodeFunctionData(
                "finalizeERC20Withdrawal",
                [
                    l1TokenNonRebasable.address,
                    l2TokenNonRebasable.address,
                    recipient.address,
                    recipient.address,
                    0,
                    data,
                ]
            ),
            1, // message nonce
            l1Gas,
        ]);

        assert.equalBN(await l2TokenNonRebasable.balanceOf(recipient.address), recipientBalanceBefore);
        assert.equalBN(await l2TokenNonRebasable.totalSupply(), totalSupplyBefore);
    })

    .test("withdrawTo() :: withdrawals disabled", async (ctx) => {
        const {
            l2TokenBridge,
            stubs: { l2TokenNonRebasable, l2TokenRebasable },
            accounts: { recipient },
        } = ctx;

        await ctx.l2TokenBridge.disableWithdrawals();

        assert.isFalse(await ctx.l2TokenBridge.isWithdrawalsEnabled());

        await assert.revertsWith(
            l2TokenBridge.withdrawTo(
                l2TokenNonRebasable.address,
                recipient.address,
                wei`1 ether`,
                wei`1 gwei`,
                "0x"
            ),
            "ErrorWithdrawalsDisabled()"
        );
        await assert.revertsWith(
            l2TokenBridge.withdrawTo(
                l2TokenRebasable.address,
                recipient.address,
                wei`1 ether`,
                wei`1 gwei`,
                "0x"
            ),
            "ErrorWithdrawalsDisabled()"
        );
    })

    .test("withdrawTo() :: unsupported l2Token", async (ctx) => {
        const {
            l2TokenBridge,
            accounts: { stranger, recipient },
        } = ctx;
        await assert.revertsWith(
            l2TokenBridge.withdrawTo(
                stranger.address,
                recipient.address,
                wei`1 ether`,
                wei`1 gwei`,
                "0x"
            ),
            "ErrorUnsupportedL2Token()"
        );
    })

    .test("withdrawTo() :: non rebasable token flow", async (ctx) => {
        const {
            l2TokenBridge,
            accounts: { deployer, recipient, l1TokenBridgeEOA },
            stubs: {
                l2Messenger: l2MessengerStub,
                l1TokenNonRebasable,
                l2TokenNonRebasable
            },
        } = ctx;

        const deployerBalanceBefore = await l2TokenNonRebasable.balanceOf(deployer.address);
        const totalSupplyBefore = await l2TokenNonRebasable.totalSupply();

        const amount = wei`1 ether`;
        const l1Gas = wei`1 wei`;
        const data = "0xdeadbeaf";

        const tx = await l2TokenBridge.withdrawTo(
            l2TokenNonRebasable.address,
            recipient.address,
            amount,
            l1Gas,
            data
        );

        await assert.emits(l2TokenBridge, tx, "WithdrawalInitiated", [
            l1TokenNonRebasable.address,
            l2TokenNonRebasable.address,
            deployer.address,
            recipient.address,
            amount,
            data,
        ]);

        await assert.emits(l2MessengerStub, tx, "SentMessage", [
            l1TokenBridgeEOA.address,
            l2TokenBridge.address,
            L1LidoTokensBridge__factory.createInterface().encodeFunctionData(
                "finalizeERC20Withdrawal",
                [
                    l1TokenNonRebasable.address,
                    l2TokenNonRebasable.address,
                    deployer.address,
                    recipient.address,
                    amount,
                    data,
                ]
            ),
            1, // message nonce
            l1Gas,
        ]);

        assert.equalBN(
            await l2TokenNonRebasable.balanceOf(deployer.address),
            deployerBalanceBefore.sub(amount)
        );

        assert.equalBN(
            await l2TokenNonRebasable.totalSupply(),
            totalSupplyBefore.sub(amount)
        );
    })

    .test("withdrawTo() :: rebasable token flow", async (ctx) => {

        const {
            l2TokenBridge,
            accounts: { deployer, l1TokenBridgeEOA, l2MessengerStubEOA, recipient },
            stubs: {
                l2Messenger,
                l1TokenNonRebasable,
                l2TokenNonRebasable,
                l1TokenRebasable,
                l2TokenRebasable
            },
        } = ctx;

        const amountToDeposit = wei`1 ether`;
        const amountToWithdraw = wei.toBigNumber(amountToDeposit).mul(ctx.exchangeRate).div(ctx.decimalsBN);
        const l1Gas = wei`1 wei`;
        const data = "0xdeadbeaf";
        const provider = await hre.ethers.provider;
        const packedTokenRateAndTimestampData = await packedTokenRateAndTimestamp(provider, ctx.exchangeRate);

        const tx1 = await l2TokenBridge
            .connect(l2MessengerStubEOA)
            .finalizeDeposit(
                l1TokenRebasable.address,
                l2TokenRebasable.address,
                deployer.address,
                deployer.address,
                amountToDeposit,
                packedTokenRateAndTimestampData
            );

        const deployerBalanceBefore = await l2TokenRebasable.balanceOf(deployer.address);
        const totalSupplyBefore = await l2TokenRebasable.totalSupply();

        const tx = await l2TokenBridge.connect(deployer).withdrawTo(
            l2TokenRebasable.address,
            recipient.address,
            amountToWithdraw,
            l1Gas,
            data
        );

        await assert.emits(l2TokenBridge, tx, "WithdrawalInitiated", [
            l1TokenRebasable.address,
            l2TokenRebasable.address,
            deployer.address,
            recipient.address,
            amountToWithdraw,
            data,
        ]);

        await assert.emits(l2Messenger, tx, "SentMessage", [
            l1TokenBridgeEOA.address,
            l2TokenBridge.address,
            L1LidoTokensBridge__factory.createInterface().encodeFunctionData(
                "finalizeERC20Withdrawal",
                [
                    l1TokenRebasable.address,
                    l2TokenRebasable.address,
                    deployer.address,
                    recipient.address,
                    amountToDeposit,
                    data,
                ]
            ),
            1, // message nonce
            l1Gas,
        ]);

        assert.equalBN(
            await l2TokenRebasable.balanceOf(recipient.address),
            deployerBalanceBefore.sub(amountToWithdraw)
        );

        assert.equalBN(
            await l2TokenRebasable.totalSupply(),
            totalSupplyBefore.sub(amountToWithdraw)
        );
    })

    .test("withdrawTo() :: zero rebasable tokens", async (ctx) => {
        const {
            l2TokenBridge,
            accounts: { deployer, l1TokenBridgeEOA, recipient },
            stubs: {
                l2Messenger,
                l1TokenRebasable,
                l2TokenRebasable
            },
        } = ctx;

        await pushTokenRate(ctx);

        const l1Gas = wei`1 wei`;
        const data = "0xdeadbeaf";
        const recipientBalanceBefore = await l2TokenRebasable.balanceOf(recipient.address);
        const totalSupplyBefore = await l2TokenRebasable.totalSupply();

        const tx = await l2TokenBridge
            .connect(recipient)
            .withdrawTo(
                l2TokenRebasable.address,
                recipient.address,
                0,
                l1Gas,
                data);

        await assert.emits(l2TokenBridge, tx, "WithdrawalInitiated", [
            l1TokenRebasable.address,
            l2TokenRebasable.address,
            recipient.address,
            recipient.address,
            0,
            data,
        ]);

        await assert.emits(l2Messenger, tx, "SentMessage", [
            l1TokenBridgeEOA.address,
            l2TokenBridge.address,
            L1LidoTokensBridge__factory.createInterface().encodeFunctionData(
                "finalizeERC20Withdrawal",
                [
                    l1TokenRebasable.address,
                    l2TokenRebasable.address,
                    recipient.address,
                    recipient.address,
                    0,
                    data,
                ]
            ),
            1, // message nonce
            l1Gas,
        ]);

        assert.equalBN(await l2TokenRebasable.balanceOf(deployer.address), recipientBalanceBefore);
        assert.equalBN(await l2TokenRebasable.totalSupply(), totalSupplyBefore);
    })

    .test("withdrawTo() :: zero non-rebasable tokens", async (ctx) => {
        const {
            l2TokenBridge,
            accounts: { deployer, l1TokenBridgeEOA, recipient },
            stubs: {
                l2Messenger,
                l1TokenNonRebasable,
                l2TokenNonRebasable
            },
        } = ctx;

        await pushTokenRate(ctx);

        const l1Gas = wei`1 wei`;
        const data = "0xdeadbeaf";
        const recipientBalanceBefore = await l2TokenNonRebasable.balanceOf(recipient.address);
        const totalSupplyBefore = await l2TokenNonRebasable.totalSupply();

        const tx = await l2TokenBridge
            .connect(recipient)
            .withdrawTo(
                l2TokenNonRebasable.address,
                recipient.address,
                0,
                l1Gas,
                data);

        await assert.emits(l2TokenBridge, tx, "WithdrawalInitiated", [
            l1TokenNonRebasable.address,
            l2TokenNonRebasable.address,
            recipient.address,
            recipient.address,
            0,
            data,
        ]);

        await assert.emits(l2Messenger, tx, "SentMessage", [
            l1TokenBridgeEOA.address,
            l2TokenBridge.address,
            L1LidoTokensBridge__factory.createInterface().encodeFunctionData(
                "finalizeERC20Withdrawal",
                [
                    l1TokenNonRebasable.address,
                    l2TokenNonRebasable.address,
                    recipient.address,
                    recipient.address,
                    0,
                    data,
                ]
            ),
            1, // message nonce
            l1Gas,
        ]);

        assert.equalBN(await l2TokenNonRebasable.balanceOf(recipient.address), recipientBalanceBefore);
        assert.equalBN(await l2TokenNonRebasable.totalSupply(), totalSupplyBefore);
    })

    .test("finalizeDeposit() :: deposits disabled", async (ctx) => {
        const {
            l2TokenBridge,
            accounts: { l2MessengerStubEOA, deployer, recipient },
            stubs: { l1TokenNonRebasable, l2TokenNonRebasable, l1TokenRebasable, l2TokenRebasable },
        } = ctx;

        await l2TokenBridge.disableDeposits();

        assert.isFalse(await l2TokenBridge.isDepositsEnabled());

        await assert.revertsWith(
            l2TokenBridge
                .connect(l2MessengerStubEOA)
                .finalizeDeposit(
                    l1TokenNonRebasable.address,
                    l2TokenNonRebasable.address,
                    deployer.address,
                    recipient.address,
                    wei`1 ether`,
                    "0x"
                ),
            "ErrorDepositsDisabled()"
        );
        await assert.revertsWith(
            l2TokenBridge
                .connect(l2MessengerStubEOA)
                .finalizeDeposit(
                    l1TokenRebasable.address,
                    l2TokenRebasable.address,
                    deployer.address,
                    recipient.address,
                    wei`1 ether`,
                    "0x"
                ),
            "ErrorDepositsDisabled()"
        );
    })

    .test("finalizeDeposit() :: unsupported l1Token", async (ctx) => {
        const {
            l2TokenBridge,
            accounts: { l2MessengerStubEOA, deployer, recipient, stranger },
            stubs: { l2TokenNonRebasable, l2TokenRebasable },
        } = ctx;

        await assert.revertsWith(
            l2TokenBridge
                .connect(l2MessengerStubEOA)
                .finalizeDeposit(
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
            l2TokenBridge
                .connect(l2MessengerStubEOA)
                .finalizeDeposit(
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

    .test("finalizeDeposit() :: unsupported l2Token", async (ctx) => {
        const {
            l2TokenBridge,
            accounts: { l2MessengerStubEOA, deployer, recipient, stranger },
            stubs: { l1TokenNonRebasable, l1TokenRebasable },
        } = ctx;

        await assert.revertsWith(
            l2TokenBridge
                .connect(l2MessengerStubEOA)
                .finalizeDeposit(
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
            l2TokenBridge
                .connect(l2MessengerStubEOA)
                .finalizeDeposit(
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

    .test("finalizeDeposit() :: unsupported tokens combination", async (ctx) => {
        const {
            l2TokenBridge,
            accounts: { l2MessengerStubEOA, deployer, recipient, stranger },
            stubs: { l1TokenNonRebasable, l1TokenRebasable, l2TokenNonRebasable, l2TokenRebasable },
        } = ctx;

        await assert.revertsWith(
            l2TokenBridge
                .connect(l2MessengerStubEOA)
                .finalizeDeposit(
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
            l2TokenBridge
                .connect(l2MessengerStubEOA)
                .finalizeDeposit(
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

    .test("finalizeDeposit() :: unauthorized messenger", async (ctx) => {
        const {
            l2TokenBridge,
            stubs: { l1TokenNonRebasable, l2TokenNonRebasable, l1TokenRebasable, l2TokenRebasable },
            accounts: { deployer, recipient, stranger },
        } = ctx;

        await assert.revertsWith(
            l2TokenBridge
                .connect(stranger)
                .finalizeDeposit(
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
            l2TokenBridge
                .connect(stranger)
                .finalizeDeposit(
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

    .test("finalizeDeposit() :: wrong cross domain sender", async (ctx) => {
        const {
            l2TokenBridge,
            stubs: { l1TokenNonRebasable, l2TokenNonRebasable, l1TokenRebasable, l2TokenRebasable, l2Messenger },
            accounts: { deployer, recipient, stranger, l2MessengerStubEOA },
        } = ctx;

        await l2Messenger.setXDomainMessageSender(stranger.address);

        await assert.revertsWith(
            l2TokenBridge
                .connect(l2MessengerStubEOA)
                .finalizeDeposit(
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
            l2TokenBridge
                .connect(l2MessengerStubEOA)
                .finalizeDeposit(
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

    .test("finalizeDeposit() :: non-rebasable token flow", async (ctx) => {
        const {
            l2TokenBridge,
            stubs: { l1TokenNonRebasable, l2TokenNonRebasable, l2Messenger },
            accounts: { deployer, recipient, l2MessengerStubEOA, l1TokenBridgeEOA },
        } = ctx;

        await l2Messenger.setXDomainMessageSender(l1TokenBridgeEOA.address);

        const totalSupplyBefore = await l2TokenNonRebasable.totalSupply();

        const amount = wei`1 ether`;
        const data = "0xdeadbeaf";
        const provider = await hre.ethers.provider;
        const packedTokenRateAndTimestampData = await packedTokenRateAndTimestamp(provider, ctx.exchangeRate);
        const dataToReceive = ethers.utils.hexConcat([packedTokenRateAndTimestampData, data]);

        const tx = await l2TokenBridge
            .connect(l2MessengerStubEOA)
            .finalizeDeposit(
                l1TokenNonRebasable.address,
                l2TokenNonRebasable.address,
                deployer.address,
                recipient.address,
                amount,
                dataToReceive
            );

        await assert.emits(l2TokenBridge, tx, "DepositFinalized", [
            l1TokenNonRebasable.address,
            l2TokenNonRebasable.address,
            deployer.address,
            recipient.address,
            amount,
            data,
        ]);

        assert.equalBN(await l2TokenNonRebasable.balanceOf(recipient.address), amount);
        assert.equalBN(await l2TokenNonRebasable.totalSupply(), totalSupplyBefore.add(amount));
    })

    .test("finalizeDeposit() :: rebasable token flow", async (ctx) => {
        const {
            l2TokenBridge,
            stubs: { l1TokenRebasable, l2TokenRebasable, l2Messenger },
            accounts: { deployer, recipient, l2MessengerStubEOA, l1TokenBridgeEOA },
        } = ctx;

        await l2Messenger.setXDomainMessageSender(l1TokenBridgeEOA.address);

        const amountToDeposit = wei`1 ether`;
        const amountToEmit = wei.toBigNumber(amountToDeposit).mul(ctx.exchangeRate).div(ctx.decimalsBN);
        const data = "0xdeadbeaf";
        const provider = await hre.ethers.provider;
        const packedTokenRateAndTimestampData = await packedTokenRateAndTimestamp(provider, ctx.exchangeRate);
        const dataToReceive = ethers.utils.hexConcat([packedTokenRateAndTimestampData, data]);

        const tx = await l2TokenBridge
            .connect(l2MessengerStubEOA)
            .finalizeDeposit(
                l1TokenRebasable.address,
                l2TokenRebasable.address,
                deployer.address,
                recipient.address,
                amountToDeposit,
                dataToReceive
            );

        await assert.emits(l2TokenBridge, tx, "DepositFinalized", [
            l1TokenRebasable.address,
            l2TokenRebasable.address,
            deployer.address,
            recipient.address,
            amountToEmit,
            data,
        ]);

        assert.equalBN(await l2TokenRebasable.balanceOf(recipient.address), amountToEmit);
    })

    .run();

async function ctxFactory() {
    const [deployer, stranger, recipient, l1TokenBridgeEOA] =
        await hre.ethers.getSigners();

    const decimals = 18;
    const decimalsBN = BigNumber.from(10).pow(decimals);
    const exchangeRate = BigNumber.from('12').pow(decimals - 1);

    const l2MessengerStub = await new CrossDomainMessengerStub__factory(
        deployer
    ).deploy({ value: wei.toBigNumber(wei`1 ether`) });
    const l2MessengerStubEOA = await testing.impersonate(l2MessengerStub.address);
    await l2MessengerStub.setXDomainMessageSender(l1TokenBridgeEOA.address);

    const emptyContract = await new EmptyContractStub__factory(deployer).deploy({
        value: wei.toBigNumber(wei`1 ether`),
    });
    const emptyContractEOA = await testing.impersonate(emptyContract.address);

    const [
        ,
        ,
        ,
        ,
        ,
        ,
        l2TokenBridgeProxyAddress
    ] = await predictAddresses(deployer, 7);

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

    const tokenRateOracle = await new TokenRateOracle__factory(deployer).deploy(
        l2MessengerStub.address,
        l2TokenBridgeProxyAddress,
        l1TokenBridgeEOA.address,
        86400
    );

    const l2TokenRebasableStub = await new ERC20RebasableBridged__factory(deployer).deploy(
        "L2 Token Rebasable",
        "L2R",
        decimals,
        l2TokenNonRebasableStub.address,
        tokenRateOracle.address,
        l2TokenBridgeProxyAddress
    );

    const l2TokenBridgeImpl = await new L2ERC20ExtendedTokensBridge__factory(
        deployer
    ).deploy(
        l2MessengerStub.address,
        l1TokenBridgeEOA.address,
        l1TokenNonRebasableStub.address,
        l1TokenRebasableStub.address,
        l2TokenNonRebasableStub.address,
        l2TokenRebasableStub.address
    );

    const l2TokenBridgeProxy = await new OssifiableProxy__factory(
        deployer
    ).deploy(
        l2TokenBridgeImpl.address,
        deployer.address,
        l2TokenBridgeImpl.interface.encodeFunctionData("initialize", [
            deployer.address,
        ])
    );

    const l2TokenBridge = L2ERC20ExtendedTokensBridge__factory.connect(
        l2TokenBridgeProxy.address,
        deployer
    );

    const roles = await Promise.all([
        l2TokenBridge.DEPOSITS_ENABLER_ROLE(),
        l2TokenBridge.DEPOSITS_DISABLER_ROLE(),
        l2TokenBridge.WITHDRAWALS_ENABLER_ROLE(),
        l2TokenBridge.WITHDRAWALS_DISABLER_ROLE(),
    ]);

    for (const role of roles) {
        await l2TokenBridge.grantRole(role, deployer.address);
    }

    await l2TokenBridge.enableDeposits();
    await l2TokenBridge.enableWithdrawals();

    return {
        stubs: {
            l1TokenNonRebasable: l1TokenNonRebasableStub,
            l1TokenRebasable: l1TokenRebasableStub,
            l2TokenNonRebasable: l2TokenNonRebasableStub,
            l2TokenRebasable: l2TokenRebasableStub,
            l2Messenger: l2MessengerStub,
        },
        accounts: {
            deployer,
            stranger,
            recipient,
            l2MessengerStubEOA,
            emptyContractEOA,
            l1TokenBridgeEOA,
        },
        l2TokenBridge,
        exchangeRate,
        decimalsBN
    };
}

async function predictAddresses(account: SignerWithAddress, txsCount: number) {
    const currentNonce = await account.getTransactionCount();

    const res: string[] = [];
    for (let i = 0; i < txsCount; ++i) {
        res.push(
            getContractAddress({
                from: account.address,
                nonce: currentNonce + i,
            })
        );
    }
    return res;
}

async function packedTokenRateAndTimestamp(provider: JsonRpcProvider, tokenRate: BigNumber) {
    const blockNumber = await provider.getBlockNumber();
    const blockTimestamp = (await provider.getBlock(blockNumber)).timestamp;
    const stEthPerTokenStr = ethers.utils.hexZeroPad(tokenRate.toHexString(), 12);
    const blockTimestampStr = ethers.utils.hexZeroPad(ethers.utils.hexlify(blockTimestamp), 5);
    return ethers.utils.hexConcat([stEthPerTokenStr, blockTimestampStr]);
}

type ContextType = Awaited<ReturnType<typeof ctxFactory>>

async function pushTokenRate(ctx: ContextType) {
    const provider = await hre.ethers.provider;

    const packedTokenRateAndTimestampData = await packedTokenRateAndTimestamp(provider, ctx.exchangeRate);

    await ctx.l2TokenBridge
        .connect(ctx.accounts.l2MessengerStubEOA)
        .finalizeDeposit(
            ctx.stubs.l1TokenRebasable.address,
            ctx.stubs.l2TokenRebasable.address,
            ctx.accounts.deployer.address,
            ctx.accounts.deployer.address,
            0,
            packedTokenRateAndTimestampData
        );
}
