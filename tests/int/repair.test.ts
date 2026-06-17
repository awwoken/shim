import { expect, test } from "bun:test";
import { join } from "node:path";

import { npmPackage } from "../support/fixtures/npm-package";
import { withNpmShimHome } from "../support/harness/npm-shim-home";
import {
  expectBinaryFailure,
  expectBinarySuccess,
} from "../support/process/run-binary";
import { runExecutable } from "../support/process/run-executable";

test("repairs generated shim contents from metadata", async () => {
  await withNpmShimHome(
    { packages: [npmPackage("repair-probe", "1.0.0")] },
    async ({ home, shim }) => {
      const shimPath = join(home.bin, "repair-probe");

      expectBinarySuccess(await shim.install("repair-probe@1.0.0"));
      await Bun.write(shimPath, "#!/bin/sh\nexit 0\n");
      expectBinaryFailure(await shim.run(["doctor"]));

      const repair = await shim.run(["repair"]);

      expectBinarySuccess(repair);
      expect(repair.stdout).toContain("Repaired shim");
      expectBinarySuccess(await shim.run(["doctor"]));
      expect(await runExecutable({ path: shimPath })).toBe(
        "repair-probe@1.0.0\n",
      );
    },
  );
});
