import { expect, test } from "bun:test";

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

const NEW_NODE_VERSION = "22.11.0";
const OLD_NODE_VERSION = "20.18.1";

type Registry = {
  tools: Record<
    string,
    {
      packageVersion: string;
      runtime: { version: string };
      installPolicy?: { runtimeOverride?: string };
    }
  >;
};

type ConfigureHomeInput = {
  home: Awaited<ReturnType<typeof createTestHome>>;
  registryUrl: string;
  mirrorUrl: string;
  bootstrapVersion?: string;
};

const configureHome = async ({
  home,
  registryUrl,
  mirrorUrl,
  bootstrapVersion = NEW_NODE_VERSION,
}: ConfigureHomeInput): Promise<void> => {
  await preseedManagedRuntime(home, NEW_NODE_VERSION);
  await preseedManagedRuntime(home, OLD_NODE_VERSION);
  await writeJsonFile(home.config, {
    providers: { npm: { registry: registryUrl } },
    runtimes: {
      node: {
        bootstrapVersion,
        mirror: mirrorUrl,
      },
    },
  });
};

test("preserves explicit runtime selection during upgrade", async () => {
  const home = await createTestHome();
  const nodeMirror = startLocalNodeMirror({
    versions: [NEW_NODE_VERSION, OLD_NODE_VERSION],
  });
  const npmRegistry = await startLocalNpmRegistry({
    packages: [
      {
        name: "runtime-upgrade",
        version: "1.0.0",
        bins: [{ name: "runtime-upgrade" }],
      },
      {
        name: "runtime-upgrade",
        version: "2.0.0",
        bins: [{ name: "runtime-upgrade" }],
      },
    ],
  });

  try {
    await configureHome({
      home,
      registryUrl: npmRegistry.url,
      mirrorUrl: nodeMirror.url,
    });

    expectBinarySuccess(
      await runBinary({
        home: home.root,
        args: [
          "install",
          "runtime-upgrade@1.0.0",
          "--runtime",
          OLD_NODE_VERSION,
        ],
      }),
    );
    expectBinarySuccess(
      await runBinary({
        home: home.root,
        args: ["upgrade", "runtime-upgrade"],
      }),
    );

    const registry = await readJsonFile<Registry>(home.registry);
    const tool = registry.tools["npm:runtime-upgrade"];

    expect(tool?.packageVersion).toBe("2.0.0");
    expect(tool?.runtime.version).toBe(OLD_NODE_VERSION);
    expect(tool?.installPolicy?.runtimeOverride).toBe(OLD_NODE_VERSION);
  } finally {
    nodeMirror.stop();
    await npmRegistry.stop();
    await removeTestHome(home);
  }
});

test("rejects upgraded engines incompatible with persisted runtime override", async () => {
  const home = await createTestHome();
  const nodeMirror = startLocalNodeMirror({
    versions: [NEW_NODE_VERSION, OLD_NODE_VERSION],
  });
  const npmRegistry = await startLocalNpmRegistry({
    packages: [
      {
        name: "engine-upgrade",
        version: "1.0.0",
        enginesNode: ">=20",
        bins: [{ name: "engine-upgrade" }],
      },
      {
        name: "engine-upgrade",
        version: "2.0.0",
        enginesNode: ">=22",
        bins: [{ name: "engine-upgrade" }],
      },
    ],
  });

  try {
    await configureHome({
      home,
      registryUrl: npmRegistry.url,
      mirrorUrl: nodeMirror.url,
    });

    expectBinarySuccess(
      await runBinary({
        home: home.root,
        args: [
          "install",
          "engine-upgrade@1.0.0",
          "--runtime",
          OLD_NODE_VERSION,
        ],
      }),
    );

    const upgrade = await runBinary({
      home: home.root,
      args: ["upgrade", "engine-upgrade"],
    });

    expectBinaryFailure(upgrade);
    expect(upgrade.stderr).toContain(
      `Selected Node.js ${OLD_NODE_VERSION} does not satisfy package requirement >=22`,
    );

    const registry = await readJsonFile<Registry>(home.registry);

    expect(registry.tools["npm:engine-upgrade"]?.packageVersion).toBe("1.0.0");
  } finally {
    nodeMirror.stop();
    await npmRegistry.stop();
    await removeTestHome(home);
  }
});

test("uses latest lts runtime instead of bootstrap when engines are absent", async () => {
  const home = await createTestHome();
  const nodeMirror = startLocalNodeMirror({
    versions: [NEW_NODE_VERSION, OLD_NODE_VERSION],
  });
  const npmRegistry = await startLocalNpmRegistry({
    packages: [
      {
        name: "default-runtime",
        version: "1.0.0",
        bins: [{ name: "default-runtime" }],
      },
    ],
  });

  try {
    await configureHome({
      home,
      registryUrl: npmRegistry.url,
      mirrorUrl: nodeMirror.url,
      bootstrapVersion: OLD_NODE_VERSION,
    });

    expectBinarySuccess(
      await runBinary({
        home: home.root,
        args: ["install", "default-runtime@1.0.0"],
      }),
    );

    const registry = await readJsonFile<Registry>(home.registry);

    expect(registry.tools["npm:default-runtime"]?.runtime.version).toBe(
      NEW_NODE_VERSION,
    );
  } finally {
    nodeMirror.stop();
    await npmRegistry.stop();
    await removeTestHome(home);
  }
});
