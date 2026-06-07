import { expect, test } from "bun:test";
import { readFile, realpath } from "node:fs/promises";
import { delimiter, join } from "node:path";

import { startLocalNodeMirror } from "../helpers/local-node-mirror";
import { startLocalNpmRegistry } from "../helpers/local-npm-registry";
import { preseedManagedRuntime } from "../helpers/preseed-runtime";
import { expectBinarySuccess, runBinary } from "../helpers/run-binary";
import {
  createTestHome,
  removeTestHome,
  writeJsonFile,
} from "../helpers/test-home";

const NODE_VERSION = "22.11.0";
const EXIT_SUCCESS = 0;

const firstPathEntry = (value: string): string => {
  const [entry = ""] = value.split(delimiter);

  return entry;
};

const runExecutable = async (
  path: string,
  env: Record<string, string>,
): Promise<void> => {
  const child = Bun.spawn([path], {
    env,
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);

  if (exitCode === EXIT_SUCCESS) {
    return;
  }

  throw new Error(`Executable failed.\nstdout:\n${stdout}\nstderr:\n${stderr}`);
};

test("uses managed node path for npm scripts and direct shims", async () => {
  const home = await createTestHome();
  const managedBin = join(home.runtimes, "node", NODE_VERSION, "bin");
  const installProbe = join(home.root, "install-path.txt");
  const shimProbe = join(home.root, "shim-path.txt");
  const nodeMirror = startLocalNodeMirror({ versions: [NODE_VERSION] });
  const npmRegistry = await startLocalNpmRegistry({
    packages: [
      {
        name: "path-probe",
        version: "1.0.0",
        bins: [{ name: "path-probe" }],
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
        args: ["install", "path-probe@1.0.0"],
        env: {
          PATH: "/usr/bin:/bin",
          SHIM_TEST_INSTALL_PROBE: installProbe,
        },
      }),
    );

    expect(await realpath(await readFile(installProbe, "utf8"))).toBe(
      await realpath(join(managedBin, "node")),
    );

    await runExecutable(join(home.bin, "path-probe"), {
      PATH: "/usr/bin:/bin",
      SHIM_TEST_PROBE: shimProbe,
    });

    expect(firstPathEntry(await readFile(shimProbe, "utf8"))).toBe(managedBin);
  } finally {
    nodeMirror.stop();
    await npmRegistry.stop();
    await removeTestHome(home);
  }
});
