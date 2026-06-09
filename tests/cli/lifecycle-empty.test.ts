import { expect, test } from "bun:test";

import {
  createTestHome,
  removeTestHome,
} from "../support/filesystem/test-home";
import { expectSuccess, runShim } from "../support/process/run-shim";

test("lists empty state", async () => {
  const home = await createTestHome();

  try {
    const result = await runShim({ home: home.root, args: ["list"] });

    expectSuccess(result);
    expect(result.stdout).toContain("No tools installed.");
  } finally {
    await removeTestHome(home);
  }
});
