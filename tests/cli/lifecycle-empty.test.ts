import { expect, test } from "bun:test";

import { expectSuccess, runShim } from "../helpers/run-shim";
import { createTestHome, removeTestHome } from "../helpers/test-home";

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
