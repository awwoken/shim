import { expect, test } from "bun:test";
import { join } from "node:path";

import { npmPackage } from "../support/fixtures/npm-package";
import { withNpmShimHome } from "../support/harness/npm-shim-home";
import { expectBinarySuccess } from "../support/process/run-binary";
import { runExecutable } from "../support/process/run-executable";

test("installs executes lists resolves removes fixture package", async () => {
  await withNpmShimHome(
    { packages: [npmPackage("fixture-cli", "1.0.0")] },
    async ({ home, shim }) => {
      const install = await shim.install("fixture-cli@1.0.0");

      expectBinarySuccess(install);
      expect(install.stdout).toContain("Installed fixture-cli@1.0.0");

      const list = await shim.list();

      expectBinarySuccess(list);
      expect(list.stdout).toContain("fixture-cli");
      expect(list.stdout).toContain("1.0.0");

      const which = await shim.which("fixture-cli");

      expectBinarySuccess(which);
      expect(which.stdout.trim()).toBe(join(home.bin, "fixture-cli"));
      expect(await runExecutable({ path: join(home.bin, "fixture-cli") })).toBe(
        "fixture-cli@1.0.0\n",
      );

      const remove = await shim.remove("fixture-cli");

      expectBinarySuccess(remove);
      expect(remove.stdout).toContain("Removed fixture-cli@1.0.0");
    },
  );
});
