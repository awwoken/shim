import { expect, test } from "bun:test";
import { realpath } from "node:fs/promises";
import { delimiter, join } from "node:path";

import { npmPackage } from "../support/fixtures/npm-package";
import {
  DEFAULT_NODE_VERSION,
  withNpmShimHome,
} from "../support/harness/npm-shim-home";
import { expectBinarySuccess } from "../support/process/run-binary";
import { runExecutable } from "../support/process/run-executable";

test("uses managed node path for npm scripts and direct shims", async () => {
  await withNpmShimHome(
    {
      packages: [
        {
          ...npmPackage("path-probe", "1.0.0"),
          scripts: {
            postinstall: "node scripts/install-probe.js",
          },
          files: [
            {
              path: "scripts/install-probe.js",
              content:
                "const { execFileSync } = require('node:child_process');\n" +
                "const { writeFileSync } = require('node:fs');\n" +
                "writeFileSync(process.env.SHIM_TEST_INSTALL_PROBE, execFileSync('sh', ['-c', 'command -v node'], { encoding: 'utf8' }).trim());\n",
            },
          ],
        },
      ],
    },
    async ({ home, shim }) => {
      const managedBin = join(
        home.runtimes,
        "node",
        DEFAULT_NODE_VERSION,
        "bin",
      );
      const installProbe = join(home.root, "install-path.txt");
      const shimProbe = join(home.root, "shim-path.txt");

      expectBinarySuccess(
        await shim.installWithEnv("path-probe@1.0.0", {
          PATH: "/usr/bin:/bin",
          SHIM_TEST_INSTALL_PROBE: installProbe,
        }),
      );

      expect(await realpath(await Bun.file(installProbe).text())).toBe(
        await realpath(join(managedBin, "node")),
      );

      await runExecutable({
        path: join(home.bin, "path-probe"),
        env: {
          PATH: "/usr/bin:/bin",
          SHIM_TEST_PROBE: shimProbe,
        },
      });

      const [firstPathEntry] = (await Bun.file(shimProbe).text()).split(
        delimiter,
      );

      expect(firstPathEntry).toBe(managedBin);
    },
  );
});
