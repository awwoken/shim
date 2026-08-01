import { expect, test } from "bun:test";
import { mkdir, symlink } from "node:fs/promises";
import { join } from "node:path";

import { expectRegistryToolPath } from "../support/assertions/registry";
import {
  addUnownedRepairBin,
  setShimMetadataSourcePath,
} from "../support/fixtures/malformed-repair-state";
import { npmPackage } from "../support/fixtures/npm-package";
import { withNpmShimHome } from "../support/harness/npm-shim-home";
import {
  expectBinaryFailure,
  expectBinarySuccess,
} from "../support/process/run-binary";
import { runExecutable } from "../support/process/run-executable";

test("skips bins not canonically owned by the registry tool", async () => {
  await withNpmShimHome(
    {
      packages: [
        npmPackage("repair-owner", "1.0.0"),
        npmPackage("repair-stale", "1.0.0"),
      ],
    },
    async ({ home, shim }) => {
      const ownerShimPath = join(home.bin, "repair-owner");

      expectBinarySuccess(await shim.install("repair-owner@1.0.0"));
      expectBinarySuccess(await shim.install("repair-stale@1.0.0"));
      await addUnownedRepairBin({
        home,
        toolId: "npm:repair-stale",
        sourceBinName: "repair-stale",
        unownedBinName: "repair-owner",
      });
      await Bun.write(ownerShimPath, "#!/bin/sh\nexit 0\n");

      const repair = await shim.run(["repair"]);

      expectBinaryFailure(repair);
      expect(repair.stdout).toContain(
        "Skipped repair-owner; registry does not assign this shim to npm:repair-stale",
      );
      expect(await runExecutable({ path: ownerShimPath })).toBe(
        "repair-owner@1.0.0\n",
      );
    },
  );
});

test("skips missing metadata paths beneath symlink ancestors", async () => {
  await withNpmShimHome(
    { packages: [npmPackage("repair-probe", "1.0.0")] },
    async ({ home, shim }) => {
      const shimPath = join(home.bin, "repair-probe");
      const brokenShimContent = "#!/bin/sh\nexit 0\n";

      expectBinarySuccess(await shim.install("repair-probe@1.0.0"));

      const toolPath = await expectRegistryToolPath(
        home.registry,
        "npm:repair-probe",
      );
      const outsideDirectory = join(home.root, "outside");
      const symlinkPath = join(toolPath, "escape");
      await mkdir(outsideDirectory);
      await symlink(outsideDirectory, symlinkPath);
      await setShimMetadataSourcePath({
        home,
        toolId: "npm:repair-probe",
        binName: "repair-probe",
        sourcePath: "escape/missing.js",
      });
      await Bun.write(shimPath, brokenShimContent);

      const repair = await shim.run(["repair"]);

      expectBinaryFailure(repair);
      expect(repair.stdout).toContain(
        "Skipped repair-probe; shim metadata has an unsupported or unsafe entry",
      );
      expect(await Bun.file(shimPath).text()).toBe(brokenShimContent);
    },
  );
});
