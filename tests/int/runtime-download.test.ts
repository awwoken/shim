import { expect, test } from "bun:test";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { startLocalNodeArchiveMirror } from "../helpers/local-node-archive-mirror";
import { startLocalNpmRegistry } from "../helpers/local-npm-registry";
import { expectBinarySuccess, runBinary } from "../helpers/run-binary";
import {
  createTestHome,
  removeTestHome,
  writeJsonFile,
} from "../helpers/test-home";

const NODE_VERSION = "22.11.0";

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

test("replaces incomplete managed runtime directories", async () => {
  const home = await createTestHome();
  const nodeMirror = await startLocalNodeArchiveMirror({
    version: NODE_VERSION,
  });
  const npmRegistry = await startLocalNpmRegistry({
    packages: [
      {
        name: "runtime-repair",
        version: "1.0.0",
        bins: [{ name: "runtime-repair" }],
      },
    ],
  });

  try {
    await configureHome(home, npmRegistry.url, nodeMirror.url);

    const runtimeBin = join(home.runtimes, "node", NODE_VERSION, "bin");

    await mkdir(runtimeBin, { recursive: true });
    await writeFile(join(runtimeBin, "node"), "#!/bin/sh\nexit 1\n");

    expectBinarySuccess(
      await runBinary({
        home: home.root,
        args: ["install", "runtime-repair@1.0.0"],
      }),
    );

    expect(await pathExists(join(runtimeBin, "node"))).toBe(true);
    expect(await pathExists(join(runtimeBin, "npm"))).toBe(true);
  } finally {
    await nodeMirror.stop();
    await npmRegistry.stop();
    await removeTestHome(home);
  }
});

test("redownloads corrupt cached node archives", async () => {
  const home = await createTestHome();
  const nodeMirror = await startLocalNodeArchiveMirror({
    version: NODE_VERSION,
  });
  const npmRegistry = await startLocalNpmRegistry({
    packages: [
      {
        name: "cache-repair",
        version: "1.0.0",
        bins: [{ name: "cache-repair" }],
      },
    ],
  });

  try {
    await configureHome(home, npmRegistry.url, nodeMirror.url);

    const cachePath = join(home.cache, "node", nodeMirror.archiveName);

    await mkdir(join(home.cache, "node"), { recursive: true });
    await writeFile(cachePath, "corrupt archive");

    expectBinarySuccess(
      await runBinary({
        home: home.root,
        args: ["install", "cache-repair@1.0.0"],
      }),
    );

    expect(await readFile(cachePath, "utf8")).not.toBe("corrupt archive");
  } finally {
    await nodeMirror.stop();
    await npmRegistry.stop();
    await removeTestHome(home);
  }
});
