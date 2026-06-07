import { expect, test } from "bun:test";
import { access, chmod, mkdir, readFile, writeFile } from "node:fs/promises";
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

const configureHome = async (
  home: Awaited<ReturnType<typeof createTestHome>>,
  registryUrl: string,
  mirrorUrl: string,
): Promise<void> => {
  await preseedManagedRuntime(home, NODE_VERSION);
  await mkdir(home.root, { recursive: true });
  await writeJsonFile(home.config, {
    providers: { npm: { registry: registryUrl } },
    runtimes: {
      node: {
        bootstrapVersion: NODE_VERSION,
        mirror: mirrorUrl,
      },
    },
  });
};

const makeRegistryWritesFail = async (
  home: Awaited<ReturnType<typeof createTestHome>>,
): Promise<void> => {
  await mkdir(home.bin, { recursive: true });
  await mkdir(home.cache, { recursive: true });
  await mkdir(home.locks, { recursive: true });
  await mkdir(home.runtimes, { recursive: true });
  await mkdir(home.tmp, { recursive: true });
  await mkdir(home.tools, { recursive: true });
  await chmod(home.root, READONLY_DIRECTORY_MODE);
};

const restoreHomeWrites = async (
  home: Awaited<ReturnType<typeof createTestHome>>,
): Promise<void> => {
  await chmod(home.root, WRITABLE_DIRECTORY_MODE);
};

test("rolls back promoted tool path and new shims when registry write fails", async () => {
  const home = await createTestHome();
  const nodeMirror = startLocalNodeMirror({ versions: [NODE_VERSION] });
  const npmRegistry = await startLocalNpmRegistry({
    packages: [
      {
        name: "rollback-new",
        version: "1.0.0",
        bins: [{ name: "rollback-new" }],
      },
    ],
  });

  try {
    await configureHome(home, npmRegistry.url, nodeMirror.url);
    await makeRegistryWritesFail(home);

    const install = await runBinary({
      home: home.root,
      args: ["install", "rollback-new@1.0.0"],
    });

    await restoreHomeWrites(home);

    expectBinaryFailure(install);
    expect(await pathExists(join(home.bin, "rollback-new"))).toBe(false);
    expect(
      await pathExists(join(home.tools, "npm", "rollback-new", "1.0.0")),
    ).toBe(false);
    expect(await pathExists(home.registry)).toBe(false);
  } finally {
    await restoreHomeWrites(home).catch(async () => {});
    nodeMirror.stop();
    await npmRegistry.stop();
    await removeTestHome(home);
  }
});

test("restores replaced tool directory after failed force reinstall", async () => {
  const home = await createTestHome();
  const markerContent = "original tool marker\n";
  const nodeMirror = startLocalNodeMirror({ versions: [NODE_VERSION] });
  const npmRegistry = await startLocalNpmRegistry({
    packages: [
      {
        name: "rollback-force",
        version: "1.0.0",
        bins: [{ name: "rollback-force" }],
      },
    ],
  });

  try {
    await configureHome(home, npmRegistry.url, nodeMirror.url);
    expectBinarySuccess(
      await runBinary({
        home: home.root,
        args: ["install", "rollback-force@1.0.0"],
      }),
    );

    const registry = await readJsonFile<Registry>(home.registry);
    const toolPath = registry.tools["npm:rollback-force"]?.toolPath;
    const markerPath = join(toolPath ?? "", "marker.txt");

    expect(toolPath).toBeDefined();
    await writeFile(markerPath, markerContent);
    await makeRegistryWritesFail(home);

    const reinstall = await runBinary({
      home: home.root,
      args: ["install", "rollback-force@1.0.0", "--force"],
    });

    await restoreHomeWrites(home);

    expectBinaryFailure(reinstall);
    expect(await readFile(markerPath, "utf8")).toBe(markerContent);
    expect(await pathExists(join(home.bin, "rollback-force"))).toBe(true);

    const unchangedRegistry = await readJsonFile<Registry>(home.registry);

    expect(unchangedRegistry.tools["npm:rollback-force"]?.toolPath).toBe(
      toolPath,
    );
  } finally {
    await restoreHomeWrites(home).catch(async () => {});
    nodeMirror.stop();
    await npmRegistry.stop();
    await removeTestHome(home);
  }
});
