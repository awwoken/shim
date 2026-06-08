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
const EXIT_SUCCESS = 0;

type Registry = {
  tools: Record<string, { toolPath: string }>;
  bins: Record<string, { toolId: string }>;
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

test("force install fully displaces previous bin owner", async () => {
  const home = await createTestHome();
  const nodeMirror = startLocalNodeMirror({ versions: [NODE_VERSION] });
  const npmRegistry = await startLocalNpmRegistry({
    packages: [
      {
        name: "tsc",
        version: "2.0.4",
        bins: [{ name: "tsc" }],
      },
      {
        name: "typescript",
        version: "5.9.3",
        bins: [{ name: "tsc" }, { name: "tsserver" }],
      },
    ],
  });

  try {
    await configureHome(home, npmRegistry.url, nodeMirror.url);

    expectBinarySuccess(
      await runBinary({ home: home.root, args: ["install", "tsc@2.0.4"] }),
    );

    const previousRegistry = await readJsonFile<Registry>(home.registry);
    const previousToolPath = previousRegistry.tools["npm:tsc"]?.toolPath;

    expect(previousToolPath).toBeDefined();
    expect(await pathExists(previousToolPath ?? "")).toBe(true);

    expectBinarySuccess(
      await runBinary({
        home: home.root,
        args: ["install", "typescript@5.9.3", "--force"],
      }),
    );

    const nextRegistry = await readJsonFile<Registry>(home.registry);

    expect(nextRegistry.tools["npm:tsc"]).toBeUndefined();
    expect(nextRegistry.tools["npm:typescript"]).toBeDefined();
    expect(nextRegistry.bins["tsc"]?.toolId).toBe("npm:typescript");
    expect(nextRegistry.bins["tsserver"]?.toolId).toBe("npm:typescript");
    expect(await pathExists(previousToolPath ?? "")).toBe(false);
  } finally {
    await nodeMirror.stop();
    await npmRegistry.stop();
    await removeTestHome(home);
  }
});

test("upgrade cannot take bins owned by another package", async () => {
  const home = await createTestHome();
  const nodeMirror = startLocalNodeMirror({ versions: [NODE_VERSION] });
  const npmRegistry = await startLocalNpmRegistry({
    packages: [
      {
        name: "bin-owner",
        version: "1.0.0",
        bins: [{ name: "shared-bin" }],
      },
      {
        name: "upgrade-target",
        version: "1.0.0",
        bins: [{ name: "upgrade-target" }],
      },
      {
        name: "upgrade-target",
        version: "2.0.0",
        bins: [{ name: "upgrade-target" }, { name: "shared-bin" }],
      },
    ],
  });

  try {
    await configureHome(home, npmRegistry.url, nodeMirror.url);

    expectBinarySuccess(
      await runBinary({
        home: home.root,
        args: ["install", "bin-owner@1.0.0"],
      }),
    );
    expectBinarySuccess(
      await runBinary({
        home: home.root,
        args: ["install", "upgrade-target@1.0.0"],
      }),
    );

    const upgrade = await runBinary({
      home: home.root,
      args: ["upgrade", "upgrade-target"],
    });

    expect(upgrade.exitCode).not.toBe(EXIT_SUCCESS);
    expect(upgrade.stderr).toContain(
      'Bin "shared-bin" is already installed by bin-owner@1.0.0',
    );

    const registry = await readJsonFile<Registry>(home.registry);

    expect(registry.tools["npm:upgrade-target"]).toBeDefined();
    expect(registry.bins["shared-bin"]?.toolId).toBe("npm:bin-owner");
  } finally {
    await nodeMirror.stop();
    await npmRegistry.stop();
    await removeTestHome(home);
  }
});

test("remove prefers package names over colliding bin aliases", async () => {
  const home = await createTestHome();
  const nodeMirror = startLocalNodeMirror({ versions: [NODE_VERSION] });
  const npmRegistry = await startLocalNpmRegistry({
    packages: [
      {
        name: "tsc",
        version: "1.0.0",
        bins: [{ name: "tsc-package" }],
      },
      {
        name: "typescript",
        version: "5.9.3",
        bins: [{ name: "tsc" }],
      },
    ],
  });

  try {
    await configureHome(home, npmRegistry.url, nodeMirror.url);

    expectBinarySuccess(
      await runBinary({ home: home.root, args: ["install", "tsc@1.0.0"] }),
    );
    expectBinarySuccess(
      await runBinary({
        home: home.root,
        args: ["install", "typescript@5.9.3"],
      }),
    );
    expectBinarySuccess(
      await runBinary({ home: home.root, args: ["remove", "npm:tsc"] }),
    );

    const registry = await readJsonFile<Registry>(home.registry);

    expect(registry.tools["npm:tsc"]).toBeUndefined();
    expect(registry.tools["npm:typescript"]).toBeDefined();
    expect(registry.bins["tsc"]?.toolId).toBe("npm:typescript");
  } finally {
    await nodeMirror.stop();
    await npmRegistry.stop();
    await removeTestHome(home);
  }
});

test("upgrade prefers package names over colliding bin aliases", async () => {
  const home = await createTestHome();
  const nodeMirror = startLocalNodeMirror({ versions: [NODE_VERSION] });
  const npmRegistry = await startLocalNpmRegistry({
    packages: [
      {
        name: "tsc",
        version: "1.0.0",
        bins: [{ name: "tsc-package" }],
      },
      {
        name: "tsc",
        version: "2.0.0",
        bins: [{ name: "tsc-package" }],
      },
      {
        name: "typescript",
        version: "5.9.3",
        bins: [{ name: "tsc" }],
      },
    ],
  });

  try {
    await configureHome(home, npmRegistry.url, nodeMirror.url);

    expectBinarySuccess(
      await runBinary({ home: home.root, args: ["install", "tsc@1.0.0"] }),
    );
    expectBinarySuccess(
      await runBinary({
        home: home.root,
        args: ["install", "typescript@5.9.3"],
      }),
    );
    expectBinarySuccess(
      await runBinary({ home: home.root, args: ["upgrade", "npm:tsc"] }),
    );

    const registry = await readJsonFile<Registry>(home.registry);

    expect(registry.tools["npm:tsc"]).toBeDefined();
    expect(registry.tools["npm:typescript"]).toBeDefined();
    expect(registry.tools["npm:tsc"]?.toolPath).toContain("2.0.0");
    expect(registry.bins["tsc"]?.toolId).toBe("npm:typescript");
  } finally {
    await nodeMirror.stop();
    await npmRegistry.stop();
    await removeTestHome(home);
  }
});
