import { expect, test } from "bun:test";
import { rename, rm, symlink } from "node:fs/promises";
import { basename, dirname, join } from "node:path";

import {
  setRegistryToolRuntimeVersion,
  writeShimMetadataValue,
} from "../support/fixtures/malformed-repair-state";
import { npmPackage } from "../support/fixtures/npm-package";
import { withNpmShimHome } from "../support/harness/npm-shim-home";
import {
  expectBinaryFailure,
  expectBinarySuccess,
} from "../support/process/run-binary";
import { runExecutable } from "../support/process/run-executable";

test("rejects repair writes through a symlinked shim bin directory", async () => {
  await withNpmShimHome(
    { packages: [npmPackage("repair-bin-root", "1.0.0")] },
    async ({ home, shim }) => {
      const outsideBinPath = join(
        dirname(home.root),
        `${basename(home.root)}-outside-bin`,
      );
      const shimPath = join(home.bin, "repair-bin-root");
      const brokenShimContent = "#!/bin/sh\nexit 0\n";

      try {
        expectBinarySuccess(await shim.install("repair-bin-root@1.0.0"));
        await rename(home.bin, outsideBinPath);
        await symlink(outsideBinPath, home.bin, "dir");
        await Bun.write(shimPath, brokenShimContent);

        const repair = await shim.run(["repair"]);

        expectBinaryFailure(repair);
        expect(repair.stdout).toContain(
          "shim bin directory has an unsafe filesystem ancestor",
        );
        expect(await Bun.file(shimPath).text()).toBe(brokenShimContent);
      } finally {
        await rm(outsideBinPath, { force: true, recursive: true });
      }
    },
  );
});

test("skips null shim metadata without aborting other repairs", async () => {
  await withNpmShimHome(
    {
      packages: [
        npmPackage("repair-null-metadata", "1.0.0"),
        npmPackage("repair-null-good", "1.0.0"),
      ],
    },
    async ({ home, shim }) => {
      const goodShimPath = join(home.bin, "repair-null-good");

      expectBinarySuccess(await shim.install("repair-null-metadata@1.0.0"));
      expectBinarySuccess(await shim.install("repair-null-good@1.0.0"));
      await writeShimMetadataValue({
        home,
        toolId: "npm:repair-null-metadata",
        value: null,
      });
      await Bun.write(goodShimPath, "#!/bin/sh\nexit 0\n");

      const repair = await shim.run(["repair"]);

      expectBinaryFailure(repair);
      expect(repair.stdout).toContain(
        "Skipped repair-null-metadata; shim metadata is malformed",
      );
      expect(repair.stdout).toContain("Repaired shim");
      expect(await runExecutable({ path: goodShimPath })).toBe(
        "repair-null-good@1.0.0\n",
      );
    },
  );
});

test("skips invalid runtime versions without aborting other repairs", async () => {
  await withNpmShimHome(
    {
      packages: [
        npmPackage("repair-invalid-runtime", "1.0.0"),
        npmPackage("repair-runtime-good", "1.0.0"),
      ],
    },
    async ({ home, shim }) => {
      const goodShimPath = join(home.bin, "repair-runtime-good");

      expectBinarySuccess(await shim.install("repair-invalid-runtime@1.0.0"));
      expectBinarySuccess(await shim.install("repair-runtime-good@1.0.0"));
      await setRegistryToolRuntimeVersion({
        home,
        toolId: "npm:repair-invalid-runtime",
        version: "latest",
      });
      await Bun.write(goodShimPath, "#!/bin/sh\nexit 0\n");

      const repair = await shim.run(["repair"]);

      expectBinaryFailure(repair);
      expect(repair.stdout).toContain(
        "Skipped repair-invalid-runtime; shim metadata has an unsupported or unsafe entry",
      );
      expect(repair.stdout).toContain("Repaired shim");
      expect(await runExecutable({ path: goodShimPath })).toBe(
        "repair-runtime-good@1.0.0\n",
      );
    },
  );
});
