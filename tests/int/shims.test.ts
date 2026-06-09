import { test } from "bun:test";

import { expectShimType } from "../support/assertions/shim-metadata";
import { withNpmShimHome } from "../support/harness/npm-shim-home";
import { expectBinarySuccess } from "../support/process/run-binary";

test("parses shebang command before choosing shim kind", async () => {
  await withNpmShimHome(
    {
      packages: [
        {
          name: "node-bin",
          version: "1.0.0",
          bins: [{ name: "node-bin", shebang: "#!/usr/bin/env node" }],
        },
        {
          name: "node-options-bin",
          version: "1.0.0",
          bins: [
            {
              name: "node-options-bin",
              shebang: "#!/usr/bin/env -S node --experimental-strip-types",
            },
          ],
        },
        {
          name: "ts-node-bin",
          version: "1.0.0",
          bins: [{ name: "ts-node-bin", shebang: "#!/usr/bin/env ts-node" }],
        },
      ],
    },
    async ({ home, shim }) => {
      for (const packageSpec of [
        "node-bin@1.0.0",
        "node-options-bin@1.0.0",
        "ts-node-bin@1.0.0",
      ]) {
        expectBinarySuccess(await shim.install(packageSpec));
      }

      await expectShimType({
        homeRoot: home.root,
        packageName: "node-bin",
        bin: "node-bin",
        type: "direct-node",
      });
      await expectShimType({
        homeRoot: home.root,
        packageName: "node-options-bin",
        bin: "node-options-bin",
        type: "path-fallback",
      });
      await expectShimType({
        homeRoot: home.root,
        packageName: "ts-node-bin",
        bin: "ts-node-bin",
        type: "path-fallback",
      });
    },
  );
});
