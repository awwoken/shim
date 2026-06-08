import { expect, test } from "bun:test";
import { join } from "node:path";

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

const runExecutable = async (path: string): Promise<string> => {
  const child = Bun.spawn([path], { stdout: "pipe", stderr: "pipe" });
  const [stdout, stderr, exitCode] = await Promise.all([
    child.stdout.text(),
    child.stderr.text(),
    child.exited,
  ]);

  if (exitCode === EXIT_SUCCESS) {
    return stdout;
  }

  throw new Error(`Executable failed.\nstdout:\n${stdout}\nstderr:\n${stderr}`);
};

test("installs executes lists resolves removes fixture package", async () => {
  const home = await createTestHome();
  const nodeMirror = startLocalNodeMirror({ versions: [NODE_VERSION] });
  const npmRegistry = await startLocalNpmRegistry({
    packages: [
      {
        name: "fixture-cli",
        version: "1.0.0",
        bins: [{ name: "fixture-cli" }],
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

    const install = await runBinary({
      home: home.root,
      args: ["install", "fixture-cli@1.0.0"],
    });

    expectBinarySuccess(install);
    expect(install.stdout).toContain("Installed fixture-cli@1.0.0");

    const list = await runBinary({ home: home.root, args: ["list"] });

    expectBinarySuccess(list);
    expect(list.stdout).toContain("fixture-cli");
    expect(list.stdout).toContain("1.0.0");

    const which = await runBinary({
      home: home.root,
      args: ["which", "fixture-cli"],
    });

    expectBinarySuccess(which);
    expect(which.stdout.trim()).toBe(join(home.bin, "fixture-cli"));
    expect(await runExecutable(join(home.bin, "fixture-cli"))).toBe(
      "fixture-cli@1.0.0\n",
    );

    const remove = await runBinary({
      home: home.root,
      args: ["remove", "fixture-cli"],
    });

    expectBinarySuccess(remove);
    expect(remove.stdout).toContain("Removed fixture-cli@1.0.0");
  } finally {
    await nodeMirror.stop();
    await npmRegistry.stop();
    await removeTestHome(home);
  }
});
