import { expect, test } from "bun:test";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";

import { expectPathExists, pathExists } from "../support/assertions/filesystem";
import { npmPackage } from "../support/fixtures/npm-package";
import { withNpmArchiveShimHome } from "../support/harness/npm-archive-shim-home";
import { DEFAULT_NODE_VERSION } from "../support/harness/npm-shim-home";
import { expectBinarySuccess } from "../support/process/run-binary";

test("replaces incomplete managed runtime directories", async () => {
  await withNpmArchiveShimHome(
    { packages: [npmPackage("runtime-repair", "1.0.0")] },
    async ({ home, shim }) => {
      const runtimeBin = join(
        home.runtimes,
        "node",
        DEFAULT_NODE_VERSION,
        "bin",
      );

      await mkdir(runtimeBin, { recursive: true });
      await Bun.write(join(runtimeBin, "node"), "#!/bin/sh\nexit 1\n");

      expectBinarySuccess(await shim.install("runtime-repair@1.0.0"));

      await expectPathExists(join(runtimeBin, "node"));
      await expectPathExists(join(runtimeBin, "npm"));
    },
  );
});

test("redownloads corrupt cached node archives", async () => {
  await withNpmArchiveShimHome(
    { packages: [npmPackage("cache-repair", "1.0.0")] },
    async ({ home, shim, archiveName }) => {
      const cachePath = join(home.cache, "node", archiveName);

      await mkdir(join(home.cache, "node"), { recursive: true });
      await Bun.write(cachePath, "corrupt archive");

      expectBinarySuccess(await shim.install("cache-repair@1.0.0"));

      expect(await pathExists(cachePath)).toBe(true);
      expect(await Bun.file(cachePath).text()).not.toBe("corrupt archive");
    },
  );
});
