import { test } from "bun:test";

import { expectShimType } from "../support/assertions/shim-metadata";
import { withNpmShimHome } from "../support/harness/npm-shim-home";
import { expectBinarySuccess } from "../support/process/run-binary";

test("parses shebang command before choosing shim kind", async () => {
  await withNpmShimHome(
    {
      packages: [
        {
          name: "shim-kind-probe",
          version: "1.0.0",
          bins: [
            { name: "node-bin", shebang: "#!/usr/bin/env node" },
            {
              name: "node-options-bin",
              shebang: "#!/usr/bin/env -S node --experimental-strip-types",
            },
            { name: "ts-node-bin", shebang: "#!/usr/bin/env ts-node" },
          ],
        },
      ],
    },
    async ({ home, shim }) => {
      expectBinarySuccess(await shim.install("shim-kind-probe@1.0.0"));

      await expectShimType({
        homeRoot: home.root,
        packageName: "shim-kind-probe",
        bin: "node-bin",
        type: "direct-node",
      });
      await expectShimType({
        homeRoot: home.root,
        packageName: "shim-kind-probe",
        bin: "node-options-bin",
        type: "path-fallback",
      });
      await expectShimType({
        homeRoot: home.root,
        packageName: "shim-kind-probe",
        bin: "ts-node-bin",
        type: "path-fallback",
      });
    },
  );
});
