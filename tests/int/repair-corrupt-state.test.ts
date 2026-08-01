import { expect, test } from "bun:test";
import { mkdir, rename, rm, symlink } from "node:fs/promises";
import { basename, dirname, join } from "node:path";

import { expectRegistryToolPath } from "../support/assertions/registry";
import {
  addUnownedRepairBin,
  removeRegistryToolBin,
  setShimMetadataSourcePath,
} from "../support/fixtures/malformed-repair-state";
import { npmPackage } from "../support/fixtures/npm-package";
import { withNpmShimHome } from "../support/harness/npm-shim-home";
import {
  expectBinaryFailure,
  expectBinarySuccess,
} from "../support/process/run-binary";
import { runExecutable } from "../support/process/run-executable";

test("rejects canonical tool paths symlinked outside the managed home", async () => {
  await withNpmShimHome(
    { packages: [npmPackage("repair-root-symlink", "1.0.0")] },
    async ({ home, shim }) => {
      const shimPath = join(home.bin, "repair-root-symlink");
      const brokenShimContent = "#!/bin/sh\nexit 0\n";
      const outsideToolPath = join(
        dirname(home.root),
        `${basename(home.root)}-outside-tool-root`,
      );

      try {
        expectBinarySuccess(await shim.install("repair-root-symlink@1.0.0"));
        const toolPath = await expectRegistryToolPath(
          home.registry,
          "npm:repair-root-symlink",
        );
        await rename(toolPath, outsideToolPath);
        await symlink(outsideToolPath, toolPath, "dir");

        const doctor = await shim.run(["doctor"]);

        expectBinaryFailure(doctor);
        expect(doctor.stdout).toContain(
          "Shim metadata has supported and safe entry",
        );

        await Bun.write(shimPath, brokenShimContent);

        const repair = await shim.run(["repair"]);

        expectBinaryFailure(repair);
        expect(repair.stdout).toContain(
          "shim metadata has an unsupported or unsafe entry",
        );
        expect(await Bun.file(shimPath).text()).toBe(brokenShimContent);
      } finally {
        await rm(outsideToolPath, { force: true, recursive: true });
      }
    },
  );
});

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

test("repairs bins recorded only in the canonical registry map", async () => {
  await withNpmShimHome(
    { packages: [npmPackage("repair-canonical-only", "1.0.0")] },
    async ({ home, shim }) => {
      const shimPath = join(home.bin, "repair-canonical-only");

      expectBinarySuccess(await shim.install("repair-canonical-only@1.0.0"));
      await removeRegistryToolBin({
        home,
        toolId: "npm:repair-canonical-only",
        binName: "repair-canonical-only",
      });
      await Bun.write(shimPath, "#!/bin/sh\nexit 0\n");

      const repair = await shim.run(["repair"]);

      expectBinarySuccess(repair);
      expect(repair.stdout).toContain("Repaired shim");
      expect(await runExecutable({ path: shimPath })).toBe(
        "repair-canonical-only@1.0.0\n",
      );
    },
  );
});

test("skips directory-valued shims without aborting other repairs", async () => {
  await withNpmShimHome(
    {
      packages: [
        npmPackage("repair-directory", "1.0.0"),
        npmPackage("repair-good", "1.0.0"),
      ],
    },
    async ({ home, shim }) => {
      const directoryShimPath = join(home.bin, "repair-directory");
      const goodShimPath = join(home.bin, "repair-good");
      const sentinelPath = join(directoryShimPath, "sentinel");

      expectBinarySuccess(await shim.install("repair-directory@1.0.0"));
      expectBinarySuccess(await shim.install("repair-good@1.0.0"));
      await rm(directoryShimPath);
      await mkdir(directoryShimPath);
      await Bun.write(sentinelPath, "keep\n");
      await Bun.write(goodShimPath, "#!/bin/sh\nexit 0\n");

      const repair = await shim.run(["repair"]);

      expectBinaryFailure(repair);
      expect(repair.stdout).toContain(
        "Skipped repair-directory; shim path is a directory",
      );
      expect(repair.stdout).toContain("Repaired shim");
      expect(await Bun.file(sentinelPath).text()).toBe("keep\n");
      expect(await runExecutable({ path: goodShimPath })).toBe(
        "repair-good@1.0.0\n",
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
