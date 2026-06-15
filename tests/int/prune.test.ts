import { expect, test } from "bun:test";
import { join } from "node:path";

import {
  expectPathExists,
  expectPathMissing,
} from "../support/assertions/filesystem";
import { npmPackage } from "../support/fixtures/npm-package";
import {
  DEFAULT_NODE_VERSION,
  withNpmShimHome,
} from "../support/harness/npm-shim-home";
import { expectBinarySuccess } from "../support/process/run-binary";

test("prunes runtimes not referenced by installed tools", async () => {
  const orphanedNodeVersion = "20.18.1";

  await withNpmShimHome(
    {
      nodeVersions: [DEFAULT_NODE_VERSION, orphanedNodeVersion],
      packages: [npmPackage("prune-runtime", "1.0.0")],
    },
    async ({ home, shim }) => {
      const activeRuntimePath = join(
        home.runtimes,
        "node",
        DEFAULT_NODE_VERSION,
      );
      const orphanedRuntimePath = join(
        home.runtimes,
        "node",
        orphanedNodeVersion,
      );

      expectBinarySuccess(await shim.install("prune-runtime@1.0.0"));

      const dryRun = await shim.prune("--dry-run");

      expectBinarySuccess(dryRun);
      expect(dryRun.stdout).toContain(
        `Would remove 1 orphaned runtime:\nnode ${orphanedNodeVersion}`,
      );
      await expectPathExists(activeRuntimePath);
      await expectPathExists(orphanedRuntimePath);

      const prune = await shim.prune("--yes");

      expectBinarySuccess(prune);
      expect(prune.stdout).toContain(
        `Removed 1 orphaned runtime:\nnode ${orphanedNodeVersion}`,
      );
      await expectPathExists(activeRuntimePath);
      await expectPathMissing(orphanedRuntimePath);
    },
  );
});
