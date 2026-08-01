import { expect, test } from "bun:test";
import { lstat, mkdir, rename, rm, symlink } from "node:fs/promises";
import { basename, dirname, join } from "node:path";

import { expectPathMissing } from "../support/assertions/filesystem";
import { expectRegistryToolPath } from "../support/assertions/registry";
import { setRegistryToolPath } from "../support/fixtures/malformed-repair-state";
import { npmPackage } from "../support/fixtures/npm-package";
import { withNpmShimHome } from "../support/harness/npm-shim-home";
import { expectBinarySuccess } from "../support/process/run-binary";
import { runExecutable } from "../support/process/run-executable";

test("exposes selected npm packages to other managed node tools", async () => {
  await withNpmShimHome(
    {
      packages: [
        {
          ...npmPackage("managed-peer", "1.0.0"),
          files: [
            { path: "index.js", content: "module.exports = 'loaded';\n" },
          ],
        },
        {
          ...npmPackage("peer-consumer", "1.0.0"),
          bins: [
            {
              name: "peer-consumer",
              body: "process.stdout.write(`${require('managed-peer')}\\n`);\n",
            },
          ],
        },
      ],
    },
    async ({ home, shim }) => {
      expectBinarySuccess(await shim.install("managed-peer@1.0.0", "--expose"));
      expectBinarySuccess(await shim.install("peer-consumer@1.0.0"));

      expect(
        await runExecutable({ path: join(home.bin, "peer-consumer") }),
      ).toBe("loaded\n");
    },
  );
});

test("exposes selected npm packages to ESM managed node tools", async () => {
  await withNpmShimHome(
    {
      packages: [
        {
          ...npmPackage("managed-peer", "1.0.0"),
          files: [
            { path: "index.js", content: "module.exports = 'loaded';\n" },
          ],
        },
        {
          ...npmPackage("early-esm-consumer", "1.0.0"),
          bins: [
            {
              name: "early-esm-consumer",
              path: "bin/early-esm-consumer.mjs",
              body: "import peer from 'managed-peer';\nprocess.stdout.write(`${peer}\\n`);\n",
            },
          ],
        },
        {
          ...npmPackage("late-esm-consumer", "1.0.0"),
          bins: [
            {
              name: "late-esm-consumer",
              path: "bin/late-esm-consumer.mjs",
              body: "import peer from 'managed-peer';\nprocess.stdout.write(`${peer}\\n`);\n",
            },
          ],
        },
      ],
    },
    async ({ home, shim }) => {
      expectBinarySuccess(await shim.install("early-esm-consumer@1.0.0"));
      expectBinarySuccess(await shim.install("managed-peer@1.0.0", "--expose"));

      expect(
        await runExecutable({ path: join(home.bin, "early-esm-consumer") }),
      ).toBe("loaded\n");

      expectBinarySuccess(await shim.install("late-esm-consumer@1.0.0"));

      expect(
        await runExecutable({ path: join(home.bin, "late-esm-consumer") }),
      ).toBe("loaded\n");
    },
  );
});

test("does not project exposure through symlinked node_modules", async () => {
  await withNpmShimHome(
    {
      packages: [
        npmPackage("managed-peer", "1.0.0"),
        npmPackage("exposure-consumer", "1.0.0"),
      ],
    },
    async ({ home, shim }) => {
      const outsideNodeModulesPath = join(
        dirname(home.root),
        `${basename(home.root)}-outside-node-modules`,
      );

      try {
        expectBinarySuccess(await shim.install("exposure-consumer@1.0.0"));
        const toolPath = await expectRegistryToolPath(
          home.registry,
          "npm:exposure-consumer",
        );
        const nodeModulesPath = join(
          toolPath,
          "npm-prefix",
          "lib",
          "node_modules",
        );
        await rm(nodeModulesPath, { recursive: true });
        await mkdir(outsideNodeModulesPath);
        await symlink(outsideNodeModulesPath, nodeModulesPath, "dir");

        expectBinarySuccess(
          await shim.install("managed-peer@1.0.0", "--expose"),
        );

        await expectPathMissing(join(outsideNodeModulesPath, "managed-peer"));
      } finally {
        await rm(outsideNodeModulesPath, { force: true, recursive: true });
      }
    },
  );
});

test("does not remove projected exposure through a symlinked scope", async () => {
  await withNpmShimHome(
    {
      packages: [
        npmPackage("@scope/managed-peer", "1.0.0"),
        npmPackage("exposure-consumer", "1.0.0"),
      ],
    },
    async ({ home, shim }) => {
      const outsideScopePath = join(
        dirname(home.root),
        `${basename(home.root)}-outside-scope`,
      );

      try {
        expectBinarySuccess(await shim.install("exposure-consumer@1.0.0"));
        expectBinarySuccess(
          await shim.install("@scope/managed-peer@1.0.0", "--expose"),
        );
        const toolPath = await expectRegistryToolPath(
          home.registry,
          "npm:exposure-consumer",
        );
        const scopePath = join(
          toolPath,
          "npm-prefix",
          "lib",
          "node_modules",
          "@scope",
        );
        await rename(scopePath, outsideScopePath);
        await symlink(outsideScopePath, scopePath, "dir");
        const outsideLinkPath = join(outsideScopePath, "managed-peer");

        expect((await lstat(outsideLinkPath)).isSymbolicLink()).toBe(true);
        expectBinarySuccess(await shim.remove("@scope/managed-peer"));
        expect((await lstat(outsideLinkPath)).isSymbolicLink()).toBe(true);
      } finally {
        await rm(outsideScopePath, { force: true, recursive: true });
      }
    },
  );
});

test("keeps projected exposure links inside the shim home", async () => {
  await withNpmShimHome(
    {
      packages: [
        {
          ...npmPackage("managed-peer", "1.0.0"),
          files: [
            { path: "index.js", content: "module.exports = 'loaded';\n" },
          ],
        },
        npmPackage("exposure-consumer", "1.0.0"),
      ],
    },
    async ({ home, shim }) => {
      const outsideToolPath = join(
        dirname(home.root),
        `${basename(home.root)}-outside-tool`,
      );
      const outsideLinkPath = join(
        outsideToolPath,
        "npm-prefix",
        "lib",
        "node_modules",
        "managed-peer",
      );

      try {
        expectBinarySuccess(await shim.install("exposure-consumer@1.0.0"));
        await setRegistryToolPath({
          home,
          toolId: "npm:exposure-consumer",
          toolPath: outsideToolPath,
        });

        expectBinarySuccess(
          await shim.install("managed-peer@1.0.0", "--expose"),
        );

        await expectPathMissing(outsideLinkPath);
      } finally {
        await rm(outsideToolPath, { force: true, recursive: true });
      }
    },
  );
});

test("removes exposed npm package links when removing the tool", async () => {
  await withNpmShimHome(
    { packages: [npmPackage("managed-peer", "1.0.0")] },
    async ({ home, shim }) => {
      expectBinarySuccess(await shim.install("managed-peer@1.0.0", "--expose"));
      expectBinarySuccess(await shim.remove("managed-peer"));

      await expectPathMissing(
        join(home.root, "npm", "exposed", "node_modules", "managed-peer"),
      );
    },
  );
});
