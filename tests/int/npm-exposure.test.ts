import { expect, test } from "bun:test";
import { join } from "node:path";

import { expectPathMissing } from "../support/assertions/filesystem";
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
