import {
  type TestHome,
  createTestHome,
  removeTestHome,
} from "../filesystem/test-home";
import type { NpmPackageFixture } from "../fixtures/npm-package";
import { startLocalNodeArchiveMirror } from "../servers/local-node-archive-mirror";
import { startLocalNpmRegistry } from "../servers/local-npm-registry";
import {
  type ShimCommands,
  DEFAULT_NODE_VERSION,
  configureNpmShimHome,
  createShimCommands,
} from "./npm-shim-home";

type NpmArchiveShimHome = {
  home: TestHome;
  shim: ShimCommands;
  archiveName: string;
};

type NpmArchiveShimHomeOptions = {
  packages: NpmPackageFixture[];
  nodeVersion?: string;
};

export const withNpmArchiveShimHome = async (
  { packages, nodeVersion = DEFAULT_NODE_VERSION }: NpmArchiveShimHomeOptions,
  runTest: (context: NpmArchiveShimHome) => Promise<void>,
): Promise<void> => {
  const home = await createTestHome();
  const nodeMirror = await startLocalNodeArchiveMirror({
    version: nodeVersion,
  });
  const npmRegistry = await startLocalNpmRegistry({ packages });

  try {
    await configureNpmShimHome({
      home,
      registryUrl: npmRegistry.url,
      mirrorUrl: nodeMirror.url,
      nodeVersions: [nodeVersion],
      bootstrapVersion: nodeVersion,
      preseedRuntime: false,
    });
    await runTest({
      home,
      shim: createShimCommands(home),
      archiveName: nodeMirror.archiveName,
    });
  } finally {
    await nodeMirror.stop();
    await npmRegistry.stop();
    await removeTestHome(home);
  }
};
