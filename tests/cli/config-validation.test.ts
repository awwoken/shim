import { expect, test } from "bun:test";

import { expectFailure, runShim } from "../helpers/run-shim";
import {
  createTestHome,
  removeTestHome,
  writeJsonFile,
} from "../helpers/test-home";

test("rejects invalid config before install", async () => {
  const home = await createTestHome();

  try {
    await writeJsonFile(home.config, {
      providers: {
        npm: {
          registry: 42,
        },
      },
    });

    const result = await runShim({
      home: home.root,
      args: ["install", "fixture-bin@1.0.0"],
    });

    expectFailure(result);
    expect(result.stderr).toContain("Invalid config file");
    expect(result.stderr).toContain("Repair or remove");
  } finally {
    await removeTestHome(home);
  }
});
