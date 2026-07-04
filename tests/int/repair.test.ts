import { expect, test } from "bun:test";
import { symlink } from "node:fs/promises";
import { join } from "node:path";

import { expectRegistryToolPath } from "../support/assertions/registry";
import {
  addTraversalRepairBin,
  setShimMetadataBins,
  setShimMetadataSourcePath,
} from "../support/fixtures/malformed-repair-state";
import { npmPackage } from "../support/fixtures/npm-package";
import { withNpmShimHome } from "../support/harness/npm-shim-home";
import {
  expectBinaryFailure,
  expectBinarySuccess,
} from "../support/process/run-binary";
import { runExecutable } from "../support/process/run-executable";

test("skips unsafe registry bin names during repair", async () => {
  await withNpmShimHome(
    { packages: [npmPackage("repair-probe", "1.0.0")] },
    async ({ home, shim }) => {
      const victimPath = join(home.root, "victim");
      const victimContent = "sentinel\n";

      expectBinarySuccess(await shim.install("repair-probe@1.0.0"));
      await addTraversalRepairBin({
        home,
        toolId: "npm:repair-probe",
        sourceBinName: "repair-probe",
        traversalBinName: "../victim",
      });
      await Bun.write(victimPath, victimContent);

      const repair = await shim.run(["repair"]);

      expectBinaryFailure(repair);
      expect(repair.stdout).toContain(
        "Skipped ../victim; registry records an unsafe shim name",
      );
      expect(await Bun.file(victimPath).text()).toBe(victimContent);
    },
  );
});

test("skips unsafe shim metadata paths during repair", async () => {
  await withNpmShimHome(
    { packages: [npmPackage("repair-probe", "1.0.0")] },
    async ({ home, shim }) => {
      const shimPath = join(home.bin, "repair-probe");
      const brokenShimContent = "#!/bin/sh\nexit 0\n";

      expectBinarySuccess(await shim.install("repair-probe@1.0.0"));
      await setShimMetadataSourcePath({
        home,
        toolId: "npm:repair-probe",
        binName: "repair-probe",
        sourcePath: "../../victim.js",
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

test("skips malformed shim metadata without aborting repair", async () => {
  await withNpmShimHome(
    {
      packages: [
        npmPackage("repair-bad-metadata", "1.0.0"),
        npmPackage("repair-good-metadata", "1.0.0"),
      ],
    },
    async ({ home, shim }) => {
      const goodShimPath = join(home.bin, "repair-good-metadata");

      expectBinarySuccess(await shim.install("repair-bad-metadata@1.0.0"));
      expectBinarySuccess(await shim.install("repair-good-metadata@1.0.0"));
      await setShimMetadataBins({
        home,
        toolId: "npm:repair-bad-metadata",
        bins: null,
      });
      await Bun.write(goodShimPath, "#!/bin/sh\nexit 0\n");

      const repair = await shim.run(["repair"]);

      expectBinaryFailure(repair);
      expect(repair.stdout).toContain(
        "Skipped repair-bad-metadata; shim metadata is malformed",
      );
      expect(repair.stdout).toContain("Repaired shim");
      expect(await runExecutable({ path: goodShimPath })).toBe(
        "repair-good-metadata@1.0.0\n",
      );
    },
  );
});

test("skips shim metadata paths that resolve outside the tool", async () => {
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
      const outsidePath = join(home.root, "outside.js");
      const symlinkPath = join(toolPath, "escape.js");
      await Bun.write(outsidePath, "process.exit(0);\n");
      await symlink(outsidePath, symlinkPath);
      await setShimMetadataSourcePath({
        home,
        toolId: "npm:repair-probe",
        binName: "repair-probe",
        sourcePath: "escape.js",
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
