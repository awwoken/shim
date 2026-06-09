import { expect, test } from "bun:test";

import {
  createTestHome,
  removeTestHome,
} from "../support/filesystem/test-home";
import { expectFailure, runShim } from "../support/process/run-shim";

test("reports missing package", async () => {
  const home = await createTestHome();

  try {
    const result = await runShim({
      home: home.root,
      args: ["remove", "missing"],
    });

    expectFailure(result);
    expect(result.stderr).toContain("No installed package or bin matched");
  } finally {
    await removeTestHome(home);
  }
});
