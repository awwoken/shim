import { test } from "bun:test";

import {
  expectPathExists,
  expectPathMissing,
} from "../support/assertions/filesystem";
import {
  expectRegistryToolPath,
  expectToolVersion,
} from "../support/assertions/registry";
import { npmPackage } from "../support/fixtures/npm-package";
import { withNpmShimHome } from "../support/harness/npm-shim-home";
import { expectBinarySuccess } from "../support/process/run-binary";

test("removes superseded package directories after upgrade", async () => {
  await withNpmShimHome(
    {
      packages: [
        npmPackage("cleanup-upgrade", "1.0.0"),
        npmPackage("cleanup-upgrade", "2.0.0"),
      ],
    },
    async ({ home, shim }) => {
      expectBinarySuccess(await shim.install("cleanup-upgrade@1.0.0"));

      const oldToolPath = await expectRegistryToolPath(
        home.registry,
        "npm:cleanup-upgrade",
      );

      await expectPathExists(oldToolPath);

      expectBinarySuccess(await shim.upgrade("cleanup-upgrade"));

      await expectToolVersion(home.registry, "npm:cleanup-upgrade", "2.0.0");
      await expectPathMissing(oldToolPath);
    },
  );
});
