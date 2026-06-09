import { expect, test } from "bun:test";
import { join } from "node:path";

import { expectPathExists } from "../support/assertions/filesystem";
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
