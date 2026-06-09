import { expect, test } from "bun:test";
import { join } from "node:path";

import {
  expectPathExists,
  expectPathMissing,
} from "../support/assertions/filesystem";
import {
  expectRegistryToolPath,
  readRegistry,
} from "../support/assertions/registry";
import {
  makeRegistryWritesFail,
  restoreHomeWrites,
  restoreHomeWritesIfPresent,
} from "../support/filesystem/home-permissions";
import { npmPackage } from "../support/fixtures/npm-package";
import { withNpmShimHome } from "../support/harness/npm-shim-home";
import {
  expectBinaryFailure,
  expectBinarySuccess,
} from "../support/process/run-binary";

test("rolls back promoted tool path and new shims when registry write fails", async () => {
  await withNpmShimHome(
    { packages: [npmPackage("rollback-new", "1.0.0")] },
    async ({ home, shim }) => {
      try {
        await makeRegistryWritesFail(home);

        const install = await shim.install("rollback-new@1.0.0");

        await restoreHomeWrites(home);

        expectBinaryFailure(install);
        await expectPathMissing(join(home.bin, "rollback-new"));
        await expectPathMissing(
          join(home.tools, "npm", "rollback-new", "1.0.0"),
        );
        await expectPathMissing(home.registry);
      } finally {
        await restoreHomeWritesIfPresent(home);
      }
    },
  );
});

test("restores replaced tool directory after failed force reinstall", async () => {
  const markerContent = "original tool marker\n";

  await withNpmShimHome(
    { packages: [npmPackage("rollback-force", "1.0.0")] },
    async ({ home, shim }) => {
      try {
        expectBinarySuccess(await shim.install("rollback-force@1.0.0"));

        const toolPath = await expectRegistryToolPath(
          home.registry,
          "npm:rollback-force",
        );
        const markerPath = join(toolPath, "marker.txt");
        await Bun.write(markerPath, markerContent);
        await makeRegistryWritesFail(home);

        const reinstall = await shim.install("rollback-force@1.0.0", "--force");

        await restoreHomeWrites(home);

        expectBinaryFailure(reinstall);
        expect(await Bun.file(markerPath).text()).toBe(markerContent);
        await expectPathExists(join(home.bin, "rollback-force"));

        const unchangedRegistry = await readRegistry(home.registry);

        expect(unchangedRegistry.tools["npm:rollback-force"]?.toolPath).toBe(
          toolPath,
        );
      } finally {
        await restoreHomeWritesIfPresent(home);
      }
    },
  );
});
