import { expect, test } from "bun:test";
import { lstat, mkdir, rename, rm, symlink } from "node:fs/promises";
import { basename, dirname, join } from "node:path";

import {
  expectPathExists,
  expectPathMissing,
} from "../support/assertions/filesystem";
import {
  expectRegistryToolPath,
  expectToolInstalled,
} from "../support/assertions/registry";
import { npmPackage } from "../support/fixtures/npm-package";
import { withNpmShimHome } from "../support/harness/npm-shim-home";
import {
  expectBinaryFailure,
  expectBinarySuccess,
} from "../support/process/run-binary";

test("rejects central exposure creation through symlinked ancestors", async () => {
  await withNpmShimHome(
    { packages: [npmPackage("managed-peer", "1.0.0")] },
    async ({ home, shim }) => {
      const outsideNpmPath = join(
        dirname(home.root),
        `${basename(home.root)}-outside-central-npm`,
      );
      const npmPath = join(home.root, "npm");

      try {
        await mkdir(outsideNpmPath);
        await symlink(outsideNpmPath, npmPath, "dir");

        const install = await shim.install("managed-peer@1.0.0", "--expose");

        expectBinaryFailure(install);
        expect(install.stderr).toContain("Unsafe npm exposure path");
        await expectPathMissing(
          join(outsideNpmPath, "exposed", "node_modules", "managed-peer"),
        );
      } finally {
        await rm(outsideNpmPath, { force: true, recursive: true });
      }
    },
  );
});

test("rejects central exposure removal through symlinked ancestors", async () => {
  await withNpmShimHome(
    { packages: [npmPackage("managed-peer", "1.0.0")] },
    async ({ home, shim }) => {
      const outsideNpmPath = join(
        dirname(home.root),
        `${basename(home.root)}-outside-central-npm`,
      );
      const npmPath = join(home.root, "npm");

      try {
        expectBinarySuccess(
          await shim.install("managed-peer@1.0.0", "--expose"),
        );
        const toolPath = await expectRegistryToolPath(
          home.registry,
          "npm:managed-peer",
        );
        const shimPath = join(home.bin, "managed-peer");
        await rename(npmPath, outsideNpmPath);
        await symlink(outsideNpmPath, npmPath, "dir");
        const outsideLinkPath = join(
          outsideNpmPath,
          "exposed",
          "node_modules",
          "managed-peer",
        );

        expect((await lstat(outsideLinkPath)).isSymbolicLink()).toBe(true);

        const remove = await shim.remove("managed-peer");

        expectBinaryFailure(remove);
        expect(remove.stderr).toContain("Unsafe npm exposure path");
        expect((await lstat(outsideLinkPath)).isSymbolicLink()).toBe(true);
        await expectToolInstalled(home.registry, "npm:managed-peer");
        await expectPathExists(shimPath);
        await expectPathExists(toolPath);
      } finally {
        await rm(outsideNpmPath, { force: true, recursive: true });
      }
    },
  );
});
