import { expect, test } from "bun:test";

import { npmToolPath } from "@/providers/npm/paths";
import { getShimPaths } from "@/support/paths";

import { expectSentinel, writeSentinel } from "../support/filesystem/sentinel";
import {
  createTestHome,
  removeTestHome,
} from "../support/filesystem/test-home";
import { npmPackage } from "../support/fixtures/npm-package";
import {
  DEFAULT_NODE_VERSION,
  configureNpmShimHome,
  withNpmShimHome,
} from "../support/harness/npm-shim-home";
import { expectBinaryFailure, runBinary } from "../support/process/run-binary";
import { startLocalNodeMirror } from "../support/servers/local-node-mirror";
import { startMaliciousVersionRegistry } from "../support/servers/malicious-version-registry";

test("rejects traversal bootstrap version safely", async () => {
  const home = await createTestHome();
  const nodeMirror = startLocalNodeMirror({ versions: [DEFAULT_NODE_VERSION] });
  const registry = startMaliciousVersionRegistry();

  try {
    await writeSentinel(home.root);
    await configureNpmShimHome({
      home,
      registryUrl: registry.url,
      mirrorUrl: nodeMirror.url,
      nodeVersions: [DEFAULT_NODE_VERSION],
      bootstrapVersion: "../../bin",
      preseedRuntime: false,
    });

    const result = await runBinary({
      home: home.root,
      args: ["install", "evil-version"],
    });

    expectBinaryFailure(result);
    expect(result.stderr).toContain("Invalid Node.js version override");
    await expectSentinel(home.root);
  } finally {
    await nodeMirror.stop();
    await registry.stop();
    await removeTestHome(home);
  }
});

test("rejects traversal package names safely", async () => {
  await withNpmShimHome(
    {
      packages: [
        {
          ...npmPackage("evil-name", "1.0.0"),
          metadataName: "../../outside",
        },
      ],
    },
    async ({ home, shim }) => {
      await writeSentinel(home.root);

      const result = await shim.install("evil-name@1.0.0");

      expectBinaryFailure(result);
      expect(result.stderr).toContain("Invalid npm package name");
      await expectSentinel(home.root);
    },
  );
});

test("rejects traversal package versions before path construction", () => {
  expect(() =>
    npmToolPath(getShimPaths("/tmp/shim-test"), "safe", "../../bin"),
  ).toThrow("Invalid npm package version");
});

test("keeps home safe when registry reports traversal version", async () => {
  const home = await createTestHome();
  const nodeMirror = startLocalNodeMirror({ versions: [DEFAULT_NODE_VERSION] });
  const registry = startMaliciousVersionRegistry();

  try {
    await writeSentinel(home.root);
    await configureNpmShimHome({
      home,
      registryUrl: registry.url,
      mirrorUrl: nodeMirror.url,
      nodeVersions: [DEFAULT_NODE_VERSION],
    });

    const result = await runBinary({
      home: home.root,
      args: ["install", "evil-version"],
    });

    expectBinaryFailure(result);
    await expectSentinel(home.root);
  } finally {
    await nodeMirror.stop();
    await registry.stop();
    await removeTestHome(home);
  }
});
