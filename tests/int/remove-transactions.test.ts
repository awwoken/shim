import { expect, test } from "bun:test";
import { join } from "node:path";

import {
  expectPathExists,
  expectPathMissing,
} from "../support/assertions/filesystem";
import {
  expectRegistryToolPath,
  expectToolInstalled,
  expectToolMissing,
  readRegistry,
} from "../support/assertions/registry";
import {
  makeRegistryWritesFail,
  restoreHomeWrites,
  restoreHomeWritesIfPresent,
} from "../support/filesystem/home-permissions";
import { setRegistryToolPackageVersion } from "../support/fixtures/malformed-repair-state";
import { npmPackage } from "../support/fixtures/npm-package";
import { withNpmShimHome } from "../support/harness/npm-shim-home";
import {
  expectBinaryFailure,
  expectBinarySuccess,
} from "../support/process/run-binary";

test("removes a tool when a remaining exposure-sync entry is malformed", async () => {
  await withNpmShimHome(
    {
      packages: [
        npmPackage("remove-target", "1.0.0"),
        npmPackage("remove-remaining", "1.0.0"),
      ],
    },
    async ({ home, shim }) => {
      expectBinarySuccess(await shim.install("remove-target@1.0.0"));
      expectBinarySuccess(await shim.install("remove-remaining@1.0.0"));
      const targetToolPath = await expectRegistryToolPath(
        home.registry,
        "npm:remove-target",
      );
      await setRegistryToolPackageVersion({
        home,
        toolId: "npm:remove-remaining",
        version: "latest",
      });

      const remove = await shim.remove("remove-target");

      expectBinarySuccess(remove);
      await expectPathMissing(join(home.bin, "remove-target"));
      await expectPathMissing(targetToolPath);
      await expectToolMissing(home.registry, "npm:remove-target");
      await expectToolInstalled(home.registry, "npm:remove-remaining");
    },
  );
});

test("failed registry removal keeps installed files", async () => {
  await withNpmShimHome(
    { packages: [npmPackage("remove-probe", "1.0.0")] },
    async ({ home, shim }) => {
      try {
        expectBinarySuccess(await shim.install("remove-probe@1.0.0"));

        const toolPath = await expectRegistryToolPath(
          home.registry,
          "npm:remove-probe",
        );

        await expectPathExists(join(home.bin, "remove-probe"));
        await expectPathExists(toolPath);
        await makeRegistryWritesFail(home);

        const failedRemove = await shim.remove("remove-probe");

        await restoreHomeWrites(home);

        expectBinaryFailure(failedRemove);
        await expectPathExists(join(home.bin, "remove-probe"));
        await expectPathExists(toolPath);

        const unchangedRegistry = await readRegistry(home.registry);

        expect(unchangedRegistry.tools["npm:remove-probe"]).toBeDefined();
      } finally {
        await restoreHomeWritesIfPresent(home);
      }
    },
  );
});
