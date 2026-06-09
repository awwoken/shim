import {
  type TestHome,
  createTestHome,
  removeTestHome,
  writeJsonFile,
} from "../filesystem/test-home";
import type { NpmPackageFixture } from "../fixtures/npm-package";
import { type RunBinaryResult, runBinary } from "../process/run-binary";
import { startLocalNodeMirror } from "../servers/local-node-mirror";
import { startLocalNpmRegistry } from "../servers/local-npm-registry";
import { preseedManagedRuntime } from "./preseed-runtime";

export const DEFAULT_NODE_VERSION = "22.11.0";

type ShimCommandOptions = {
  env?: Record<string, string>;
};

export type ShimCommands = {
  run: (
    args: string[],
    options?: ShimCommandOptions,
  ) => Promise<RunBinaryResult>;
  install: (packageSpec: string, ...args: string[]) => Promise<RunBinaryResult>;
  installWithEnv: (
    packageSpec: string,
    env: Record<string, string>,
    ...args: string[]
  ) => Promise<RunBinaryResult>;
  remove: (packageOrBin: string, ...args: string[]) => Promise<RunBinaryResult>;
  upgrade: (
    packageOrBin?: string,
    ...args: string[]
  ) => Promise<RunBinaryResult>;
  upgradeWithEnv: (
    packageOrBin: string | undefined,
    env: Record<string, string>,
    ...args: string[]
  ) => Promise<RunBinaryResult>;
  list: () => Promise<RunBinaryResult>;
  which: (bin: string) => Promise<RunBinaryResult>;
};

export type NpmShimHome = {
  home: TestHome;
  shim: ShimCommands;
};

type NpmShimHomeOptions = {
  packages: NpmPackageFixture[];
  nodeVersions?: string[];
  bootstrapVersion?: string;
  preseedRuntime?: boolean;
};

export const createShimCommands = (home: TestHome): ShimCommands => {
  const run = async (
    args: string[],
    options: ShimCommandOptions = {},
  ): Promise<RunBinaryResult> =>
    await runBinary({ home: home.root, args, env: options.env });

  return {
    run,
    install: async (packageSpec, ...args) =>
      await run(["install", packageSpec, ...args]),
    installWithEnv: async (packageSpec, env, ...args) =>
      await run(["install", packageSpec, ...args], { env }),
    remove: async (packageOrBin, ...args) =>
      await run(["remove", packageOrBin, ...args]),
    upgrade: async (packageOrBin, ...args) =>
      await run(
        packageOrBin === undefined
          ? ["upgrade", ...args]
          : ["upgrade", packageOrBin, ...args],
      ),
    upgradeWithEnv: async (packageOrBin, env, ...args) =>
      await run(
        packageOrBin === undefined
          ? ["upgrade", ...args]
          : ["upgrade", packageOrBin, ...args],
        { env },
      ),
    list: async () => await run(["list"]),
    which: async (bin) => await run(["which", bin]),
  };
};

export const configureNpmShimHome = async ({
  home,
  registryUrl,
  mirrorUrl,
  nodeVersions,
  bootstrapVersion = DEFAULT_NODE_VERSION,
  preseedRuntime = true,
}: {
  home: TestHome;
  registryUrl: string;
  mirrorUrl: string;
  nodeVersions: string[];
  bootstrapVersion?: string;
  preseedRuntime?: boolean;
}): Promise<void> => {
  if (preseedRuntime) {
    await Promise.all(
      nodeVersions.map(
        async (version) => await preseedManagedRuntime(home, version),
      ),
    );
  }

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

export const withNpmShimHome = async (
  {
    packages,
    nodeVersions = [DEFAULT_NODE_VERSION],
    bootstrapVersion = DEFAULT_NODE_VERSION,
    preseedRuntime = true,
  }: NpmShimHomeOptions,
  runTest: (context: NpmShimHome) => Promise<void>,
): Promise<void> => {
  const home = await createTestHome();
  const nodeMirror = startLocalNodeMirror({ versions: nodeVersions });
  const npmRegistry = await startLocalNpmRegistry({ packages });

  try {
    await configureNpmShimHome({
      home,
      registryUrl: npmRegistry.url,
      mirrorUrl: nodeMirror.url,
      nodeVersions,
      bootstrapVersion,
      preseedRuntime,
    });
    await runTest({ home, shim: createShimCommands(home) });
  } finally {
    await nodeMirror.stop();
    await npmRegistry.stop();
    await removeTestHome(home);
  }
};
