import { test } from "bun:test";
import { join } from "node:path";

import { expectPathMissing } from "../support/assertions/filesystem";
import {
  expectToolIgnoreScripts,
  expectToolVersion,
} from "../support/assertions/registry";
import { npmPackage } from "../support/fixtures/npm-package";
import { withNpmShimHome } from "../support/harness/npm-shim-home";
import { expectBinarySuccess } from "../support/process/run-binary";

test("preserves ignore-scripts policy during upgrade", async () => {
  await withNpmShimHome(
    {
      packages: [
        npmPackage("script-policy", "1.0.0"),
        {
          ...npmPackage("script-policy", "2.0.0"),
          scripts: {
            postinstall: "node scripts/postinstall.js",
          },
          files: [
            {
              path: "scripts/postinstall.js",
              content:
                "const { writeFileSync } = require('node:fs');\n" +
                "writeFileSync(process.env.SHIM_TEST_SCRIPT_PROBE, 'ran');\n",
            },
          ],
        },
      ],
    },
    async ({ home, shim }) => {
      const scriptProbe = join(home.root, "upgrade-script-ran.txt");

      expectBinarySuccess(
        await shim.install("script-policy@1.0.0", "--ignore-scripts"),
      );
      expectBinarySuccess(
        await shim.upgradeWithEnv("script-policy", {
          SHIM_TEST_SCRIPT_PROBE: scriptProbe,
        }),
      );

      await expectToolVersion(home.registry, "npm:script-policy", "2.0.0");
      await expectToolIgnoreScripts(home.registry, "npm:script-policy", true);
      await expectPathMissing(scriptProbe);
    },
  );
});
