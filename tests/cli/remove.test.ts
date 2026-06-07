import { expect, test } from "bun:test";

import { expectFailure, runShim } from "../helpers/run-shim";
import { createTestHome, removeTestHome } from "../helpers/test-home";

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
