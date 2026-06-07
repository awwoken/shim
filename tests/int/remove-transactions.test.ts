import { expect, test } from "bun:test";
import { access, chmod } from "node:fs/promises";
import { join } from "node:path";

import { startLocalNodeMirror } from "../helpers/local-node-mirror";
import { startLocalNpmRegistry } from "../helpers/local-npm-registry";
import { preseedManagedRuntime } from "../helpers/preseed-runtime";
import {
  expectBinaryFailure,
  expectBinarySuccess,
  runBinary,
} from "../helpers/run-binary";
import {
  createTestHome,
  readJsonFile,
  removeTestHome,
  writeJsonFile,
} from "../helpers/test-home";

const NODE_VERSION = "22.11.0";
const READONLY_DIRECTORY_MODE = 0o555;
const WRITABLE_DIRECTORY_MODE = 0o755;

type Registry = {
  tools: Record<string, { toolPath: string }>;
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

test("failed registry removal keeps installed files", async () => {
  const home = await createTestHome();
  const nodeMirror = startLocalNodeMirror({ versions: [NODE_VERSION] });
  const npmRegistry = await startLocalNpmRegistry({
    packages: [
      {
        name: "remove-probe",
        version: "1.0.0",
        bins: [{ name: "remove-probe" }],
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
        args: ["install", "remove-probe@1.0.0"],
      }),
    );

    const registry = await readJsonFile<Registry>(home.registry);
    const toolPath = registry.tools["npm:remove-probe"]?.toolPath;

    expect(toolPath).toBeDefined();
    expect(await pathExists(join(home.bin, "remove-probe"))).toBe(true);
    expect(await pathExists(toolPath ?? "")).toBe(true);

    await chmod(home.root, READONLY_DIRECTORY_MODE);

    const failedRemove = await runBinary({
      home: home.root,
      args: ["remove", "remove-probe"],
    });

    await chmod(home.root, WRITABLE_DIRECTORY_MODE);

    expectBinaryFailure(failedRemove);
    expect(await pathExists(join(home.bin, "remove-probe"))).toBe(true);
    expect(await pathExists(toolPath ?? "")).toBe(true);

    const unchangedRegistry = await readJsonFile<Registry>(home.registry);

    expect(unchangedRegistry.tools["npm:remove-probe"]).toBeDefined();
  } finally {
    await chmod(home.root, WRITABLE_DIRECTORY_MODE).catch(
      async (caughtError) => {
        if (caughtError instanceof Error && "code" in caughtError) {
          return;
        }

        throw caughtError;
      },
    );
    nodeMirror.stop();
    await npmRegistry.stop();
    await removeTestHome(home);
  }
});
