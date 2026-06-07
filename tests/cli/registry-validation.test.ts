import { expect, test } from "bun:test";

import { expectFailure, runShim } from "../helpers/run-shim";
import {
  createTestHome,
  removeTestHome,
  writeJsonFile,
} from "../helpers/test-home";

test("rejects invalid registry before listing", async () => {
  const home = await createTestHome();

  try {
    await writeJsonFile(home.registry, {
      version: "not-a-number",
      tools: {},
      bins: {},
    });

    const result = await runShim({ home: home.root, args: ["list"] });

    expectFailure(result);
    expect(result.stderr).toContain("Invalid registry file");
    expect(result.stderr).toContain("Repair or remove");
  } finally {
    await removeTestHome(home);
  }
});
