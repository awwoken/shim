import { expect, test } from "bun:test";
import { access } from "node:fs/promises";

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
  tools: Record<string, { packageVersion: string; toolPath: string }>;
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

test("removes superseded package directories after upgrade", async () => {
  const home = await createTestHome();
  const nodeMirror = startLocalNodeMirror({ versions: [NODE_VERSION] });
  const npmRegistry = await startLocalNpmRegistry({
    packages: [
      {
        name: "cleanup-upgrade",
        version: "1.0.0",
        bins: [{ name: "cleanup-upgrade" }],
      },
      {
        name: "cleanup-upgrade",
        version: "2.0.0",
        bins: [{ name: "cleanup-upgrade" }],
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
        args: ["install", "cleanup-upgrade@1.0.0"],
      }),
    );

    const before = await readJsonFile<Registry>(home.registry);
    const oldToolPath = before.tools["npm:cleanup-upgrade"]?.toolPath;

    expect(oldToolPath).toBeDefined();
    expect(await pathExists(oldToolPath ?? "")).toBe(true);

    expectBinarySuccess(
      await runBinary({
        home: home.root,
        args: ["upgrade", "cleanup-upgrade"],
      }),
    );

    const after = await readJsonFile<Registry>(home.registry);

    expect(after.tools["npm:cleanup-upgrade"]?.packageVersion).toBe("2.0.0");
    expect(await pathExists(oldToolPath ?? "")).toBe(false);
  } finally {
    nodeMirror.stop();
    await npmRegistry.stop();
    await removeTestHome(home);
  }
});
