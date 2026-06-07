import { expect, test } from "bun:test";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { npmToolPath } from "@/providers/npm/paths";
import { getShimPaths } from "@/support/paths";

import { startLocalNodeMirror } from "../helpers/local-node-mirror";
import { startLocalNpmRegistry } from "../helpers/local-npm-registry";
import { preseedManagedRuntime } from "../helpers/preseed-runtime";
import { expectBinaryFailure, runBinary } from "../helpers/run-binary";
import {
  createTestHome,
  removeTestHome,
  writeJsonFile,
} from "../helpers/test-home";

const NODE_VERSION = "22.11.0";
const SENTINEL_CONTENT = "sentinel\n";

const writeSentinel = async (homeRoot: string): Promise<void> => {
  await mkdir(join(homeRoot, "bin"), { recursive: true });
  await writeFile(join(homeRoot, "bin", "sentinel"), SENTINEL_CONTENT);
};

const expectSentinel = async (homeRoot: string): Promise<void> => {
  expect(await readFile(join(homeRoot, "bin", "sentinel"), "utf8")).toBe(
    SENTINEL_CONTENT,
  );
};

const startMaliciousVersionRegistry = (): { url: string; stop: () => void } => {
  let registryUrl = "";
  const server = Bun.serve({
    port: 0,
    fetch: (request) => {
      const url = new URL(request.url);

      if (url.pathname === "/evil-version") {
        return Response.json({
          name: "evil-version",
          "dist-tags": { latest: "../../bin" },
          versions: {
            "../../bin": {
              name: "evil-version",
              version: "../../bin",
              dist: {
                tarball: `${registryUrl}/evil-version/-/evil-version-evil.tgz`,
              },
            },
          },
        });
      }

      return new Response("not found", { status: 404 });
    },
  });

  registryUrl = server.url.toString().replace(/\/$/u, "");

  return {
    url: registryUrl,
    stop: () => {
      server.stop(true);
    },
  };
};

test("rejects traversal bootstrap version safely", async () => {
  const home = await createTestHome();
  const nodeMirror = startLocalNodeMirror({ versions: [NODE_VERSION] });
  const registry = startMaliciousVersionRegistry();

  try {
    await writeSentinel(home.root);
    await writeJsonFile(home.config, {
      providers: { npm: { registry: registry.url } },
      runtimes: {
        node: {
          bootstrapVersion: "../../bin",
          mirror: nodeMirror.url,
        },
      },
    });

    const result = await runBinary({
      home: home.root,
      args: ["install", "evil-version"],
    });

    expectBinaryFailure(result);
    expect(result.stderr).toContain("Invalid Node.js version override");
    await expectSentinel(home.root);
  } finally {
    nodeMirror.stop();
    registry.stop();
    await removeTestHome(home);
  }
});

test("rejects traversal package names safely", async () => {
  const home = await createTestHome();
  const nodeMirror = startLocalNodeMirror({ versions: [NODE_VERSION] });
  const npmRegistry = await startLocalNpmRegistry({
    packages: [
      {
        name: "evil-name",
        metadataName: "../../outside",
        version: "1.0.0",
        bins: [{ name: "evil-name" }],
      },
    ],
  });

  try {
    await preseedManagedRuntime(home, NODE_VERSION);
    await writeSentinel(home.root);
    await writeJsonFile(home.config, {
      providers: { npm: { registry: npmRegistry.url } },
      runtimes: {
        node: {
          bootstrapVersion: NODE_VERSION,
          mirror: nodeMirror.url,
        },
      },
    });

    const result = await runBinary({
      home: home.root,
      args: ["install", "evil-name@1.0.0"],
    });

    expectBinaryFailure(result);
    expect(result.stderr).toContain("Invalid npm package name");
    await expectSentinel(home.root);
  } finally {
    nodeMirror.stop();
    await npmRegistry.stop();
    await removeTestHome(home);
  }
});

test("rejects traversal package versions before path construction", () => {
  expect(() =>
    npmToolPath(getShimPaths("/tmp/shim-test"), "safe", "../../bin"),
  ).toThrow("Invalid npm package version");
});

test("keeps home safe when registry reports traversal version", async () => {
  const home = await createTestHome();
  const nodeMirror = startLocalNodeMirror({ versions: [NODE_VERSION] });
  const registry = startMaliciousVersionRegistry();

  try {
    await preseedManagedRuntime(home, NODE_VERSION);
    await writeSentinel(home.root);
    await writeJsonFile(home.config, {
      providers: { npm: { registry: registry.url } },
      runtimes: {
        node: {
          bootstrapVersion: NODE_VERSION,
          mirror: nodeMirror.url,
        },
      },
    });

    const result = await runBinary({
      home: home.root,
      args: ["install", "evil-version"],
    });

    expectBinaryFailure(result);
    await expectSentinel(home.root);
  } finally {
    nodeMirror.stop();
    registry.stop();
    await removeTestHome(home);
  }
});
