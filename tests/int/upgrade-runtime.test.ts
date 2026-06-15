import { expect, test } from "bun:test";

import {
  expectToolRuntime,
  expectToolRuntimeOverride,
  expectToolVersion,
} from "../support/assertions/registry";
import {
  createTestHome,
  removeTestHome,
} from "../support/filesystem/test-home";
import { npmPackage } from "../support/fixtures/npm-package";
import {
  configureNpmShimHome,
  createShimCommands,
  DEFAULT_NODE_VERSION,
  withNpmShimHome,
} from "../support/harness/npm-shim-home";
import {
  expectBinaryFailure,
  expectBinarySuccess,
} from "../support/process/run-binary";
import { startLocalNodeMirror } from "../support/servers/local-node-mirror";
import { startLocalNpmRegistry } from "../support/servers/local-npm-registry";

test("selects newly available default runtime during upgrade", async () => {
  const initialNodeVersion = "20.18.1";
  const packageName = "default-runtime-upgrade";
  const home = await createTestHome();
  const nodeMirror = startLocalNodeMirror({ versions: [initialNodeVersion] });
  const npmRegistry = await startLocalNpmRegistry({
    packages: [
      npmPackage(packageName, "1.0.0"),
      npmPackage(packageName, "2.0.0"),
    ],
  });

  try {
    await configureNpmShimHome({
      home,
      registryUrl: npmRegistry.url,
      mirrorUrl: nodeMirror.url,
      nodeVersions: [initialNodeVersion, DEFAULT_NODE_VERSION],
      bootstrapVersion: initialNodeVersion,
    });
    const shim = createShimCommands(home);

    expectBinarySuccess(await shim.install(`${packageName}@1.0.0`));
    await expectToolRuntime(
      home.registry,
      `npm:${packageName}`,
      initialNodeVersion,
    );

    nodeMirror.setVersions([initialNodeVersion, DEFAULT_NODE_VERSION]);

    expectBinarySuccess(await shim.upgrade(packageName));

    await expectToolVersion(home.registry, `npm:${packageName}`, "2.0.0");
    await expectToolRuntime(
      home.registry,
      `npm:${packageName}`,
      DEFAULT_NODE_VERSION,
    );
  } finally {
    await nodeMirror.stop();
    await npmRegistry.stop();
    await removeTestHome(home);
  }
});

test("preserves explicit runtime selection during upgrade", async () => {
  await withNpmShimHome(
    {
      nodeVersions: [DEFAULT_NODE_VERSION, "20.18.1"],
      packages: [
        npmPackage("runtime-upgrade", "1.0.0"),
        npmPackage("runtime-upgrade", "2.0.0"),
      ],
    },
    async ({ home, shim }) => {
      expectBinarySuccess(
        await shim.install("runtime-upgrade@1.0.0", "--runtime", "20.18.1"),
      );
      expectBinarySuccess(await shim.upgrade("runtime-upgrade"));

      await expectToolVersion(home.registry, "npm:runtime-upgrade", "2.0.0");
      await expectToolRuntime(home.registry, "npm:runtime-upgrade", "20.18.1");
      await expectToolRuntimeOverride(
        home.registry,
        "npm:runtime-upgrade",
        "20.18.1",
      );
    },
  );
});

test("rejects upgraded engines incompatible with persisted runtime override", async () => {
  await withNpmShimHome(
    {
      nodeVersions: [DEFAULT_NODE_VERSION, "20.18.1"],
      packages: [
        {
          ...npmPackage("engine-upgrade", "1.0.0"),
          enginesNode: ">=20",
        },
        {
          ...npmPackage("engine-upgrade", "2.0.0"),
          enginesNode: ">=22",
        },
      ],
    },
    async ({ home, shim }) => {
      expectBinarySuccess(
        await shim.install("engine-upgrade@1.0.0", "--runtime", "20.18.1"),
      );

      const upgrade = await shim.upgrade("engine-upgrade");

      expectBinaryFailure(upgrade);
      expect(upgrade.stderr).toContain(
        "Selected Node.js 20.18.1 does not satisfy package requirement >=22",
      );
      await expectToolVersion(home.registry, "npm:engine-upgrade", "1.0.0");
    },
  );
});

test("uses latest lts runtime instead of bootstrap when engines are absent", async () => {
  await withNpmShimHome(
    {
      nodeVersions: [DEFAULT_NODE_VERSION, "20.18.1"],
      bootstrapVersion: "20.18.1",
      packages: [npmPackage("default-runtime", "1.0.0")],
    },
    async ({ home, shim }) => {
      expectBinarySuccess(await shim.install("default-runtime@1.0.0"));

      await expectToolRuntime(
        home.registry,
        "npm:default-runtime",
        DEFAULT_NODE_VERSION,
      );
    },
  );
});
