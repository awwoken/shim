import { expect, test } from "bun:test";
import { access } from "node:fs/promises";
import { join } from "node:path";

import { startLocalNodeMirror } from "../helpers/local-node-mirror";
import { startLocalNpmRegistry } from "../helpers/local-npm-registry";
import { preseedManagedRuntime } from "../helpers/preseed-runtime";
import { expectBinarySuccess, runBinary } from "../helpers/run-binary";
import {
  createTestHome,
  readJsonFile,
  removeTestHome,
  writeJsonFile,
} from "../helpers/test-home";

const NODE_VERSION = "22.11.0";

type Registry = {
  tools: Record<
    string,
    {
      packageVersion: string;
      installPolicy?: { ignoreScripts: boolean };
    }
  >;
};

const pathExists = async (path: string): Promise<boolean> => {
  try {
    await access(path);

    return true;
  } catch (caughtError) {
    if (caughtError instanceof Error && "code" in caughtError) {
      return false;
    }

    throw caughtError;
  }
};

test("preserves ignore-scripts policy during upgrade", async () => {
  const home = await createTestHome();
  const scriptProbe = join(home.root, "upgrade-script-ran.txt");
  const nodeMirror = startLocalNodeMirror({ versions: [NODE_VERSION] });
  const npmRegistry = await startLocalNpmRegistry({
    packages: [
      {
        name: "script-policy",
        version: "1.0.0",
        bins: [{ name: "script-policy" }],
      },
      {
        name: "script-policy",
        version: "2.0.0",
        bins: [{ name: "script-policy" }],
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
  });

  try {
    await preseedManagedRuntime(home, NODE_VERSION);
    await writeJsonFile(home.config, {
      providers: { npm: { registry: npmRegistry.url } },
      runtimes: {
        node: {
          bootstrapVersion: NODE_VERSION,
          mirror: nodeMirror.url,
        },
      },
    });

    expectBinarySuccess(
      await runBinary({
        home: home.root,
        args: ["install", "script-policy@1.0.0", "--ignore-scripts"],
      }),
    );
    expectBinarySuccess(
      await runBinary({
        home: home.root,
        args: ["upgrade", "script-policy"],
        env: { SHIM_TEST_SCRIPT_PROBE: scriptProbe },
      }),
    );

    const registry = await readJsonFile<Registry>(home.registry);

    expect(registry.tools["npm:script-policy"]?.packageVersion).toBe("2.0.0");
    expect(
      registry.tools["npm:script-policy"]?.installPolicy?.ignoreScripts,
    ).toBe(true);
    expect(await pathExists(scriptProbe)).toBe(false);
  } finally {
    await nodeMirror.stop();
    await npmRegistry.stop();
    await removeTestHome(home);
  }
});
