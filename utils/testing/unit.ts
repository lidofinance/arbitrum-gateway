import hre from "hardhat";
import { CtxFactory, StepTest, CtxFn } from "./types";

export function unit<T extends object>(title: string, ctxFactory: CtxFactory<T>) {
  return new UnitTest(title, ctxFactory);
}

export class UnitTest<T extends object> {
  public readonly title: string;

  private readonly ctxFactory: CtxFactory<T>;
  private readonly tests: StepTest<T>[] = [];

  constructor(title: string, ctxFactory: CtxFactory<T>) {
    this.title = title;
    this.ctxFactory = ctxFactory;
  }

  group<K>(group: K[], testFactory: (item: K) => [string, CtxFn<T>]) {
    const tests = group.map(testFactory);
    for (const [title, test] of tests) {
      this.tests.push({ title, test });
    }
    return this;
  }

  test(title: string, test: CtxFn<T>) {
    this.tests.push({ title, test });
    return this;
  }

  run() {
    const { title, tests, ctxFactory } = this;

    describe(title, function () {
      // @ts-ignore
      let ctx: T = {};

      let evmSnapshotId: string;

      // prepare unit tests
      before(async () => {
        ctx = Object.assign(ctx, await ctxFactory());
        evmSnapshotId = await hre.ethers.provider.send("evm_snapshot", []);
      });

      // create mocha tests
      for (const { title, test } of tests) {
        it(title, () => test(ctx));
      }

      afterEach(async () => {
        await hre.ethers.provider.send("evm_revert", [evmSnapshotId]);
        evmSnapshotId = await hre.ethers.provider.send("evm_snapshot", []);
      });
    });
  }
}
