import { expect, test } from "bun:test";

import {
  createTestHome,
  removeTestHome,
  writeJsonFile,
} from "../support/filesystem/test-home";
import { expectFailure, runShim } from "../support/process/run-shim";

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
