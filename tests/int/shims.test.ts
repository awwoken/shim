import { expect, test } from "bun:test";

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
const DIRECT_NODE_SHIM = "direct-node";
const PATH_FALLBACK_SHIM = "path-fallback";

type ShimMetadata = {
  bins: Record<string, { type: string }>;
};

const readShimMetadata = async (
  homeRoot: string,
  packageName: string,
): Promise<ShimMetadata> =>
  await readJsonFile<ShimMetadata>(
    `${homeRoot}/tools/npm/${packageName}/1.0.0/shim.json`,
  );

test("parses shebang command before choosing shim kind", async () => {
  const home = await createTestHome();
  const nodeMirror = startLocalNodeMirror({ versions: [NODE_VERSION] });
  const npmRegistry = await startLocalNpmRegistry({
    packages: [
      {
        name: "node-bin",
        version: "1.0.0",
        bins: [{ name: "node-bin", shebang: "#!/usr/bin/env node" }],
      },
      {
        name: "node-options-bin",
        version: "1.0.0",
        bins: [
          {
            name: "node-options-bin",
            shebang: "#!/usr/bin/env -S node --experimental-strip-types",
          },
        ],
      },
      {
        name: "ts-node-bin",
        version: "1.0.0",
        bins: [{ name: "ts-node-bin", shebang: "#!/usr/bin/env ts-node" }],
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

    for (const packageSpec of [
      "node-bin@1.0.0",
      "node-options-bin@1.0.0",
      "ts-node-bin@1.0.0",
    ]) {
      expectBinarySuccess(
        await runBinary({ home: home.root, args: ["install", packageSpec] }),
      );
    }

    const nodeMetadata = await readShimMetadata(home.root, "node-bin");
    const optionsMetadata = await readShimMetadata(
      home.root,
      "node-options-bin",
    );
    const tsNodeMetadata = await readShimMetadata(home.root, "ts-node-bin");

    expect(nodeMetadata.bins["node-bin"]?.type).toBe(DIRECT_NODE_SHIM);
    expect(optionsMetadata.bins["node-options-bin"]?.type).toBe(
      PATH_FALLBACK_SHIM,
    );
    expect(tsNodeMetadata.bins["ts-node-bin"]?.type).toBe(PATH_FALLBACK_SHIM);
  } finally {
    await nodeMirror.stop();
    await npmRegistry.stop();
    await removeTestHome(home);
  }
});
