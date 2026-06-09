import { expect, test } from "bun:test";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";

import { pathExists } from "../support/assertions/filesystem";
import {
  createTestHome,
  removeTestHome,
} from "../support/filesystem/test-home";
import {
  expectFailure,
  runShim,
  runShimWithShellPrelude,
} from "../support/process/run-shim";

test("rejects command while mutation lock exists", async () => {
  const home = await createTestHome();

  try {
    await mkdir(join(home.locks, "mutation.lock"), { recursive: true });

    const result = await runShim({
      home: home.root,
      args: ["remove", "missing"],
    });

    expectFailure(result);
    expect(result.stderr).toContain(
      "another shim command is already modifying state",
    );
  } finally {
    await removeTestHome(home);
  }
});

test("cleans half-created lock after owner write failure", async () => {
  const home = await createTestHome();

  try {
    await mkdir(home.locks, { recursive: true });

    const failedRemove = await runShimWithShellPrelude({
      home: home.root,
      args: ["remove", "missing"],
      shellPrelude: "umask 0777",
    });

    expectFailure(failedRemove);
    expect(await pathExists(join(home.locks, "mutation.lock"))).toBe(false);

    const laterRemove = await runShim({
      home: home.root,
      args: ["remove", "missing"],
    });

    expectFailure(laterRemove);
    expect(laterRemove.stderr).toContain("No installed package or bin matched");
  } finally {
    await removeTestHome(home);
  }
});
