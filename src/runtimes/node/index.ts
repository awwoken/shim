import { join } from "node:path";

import type { NodeRuntimeConfig } from "@/core/config";
import { silentReporter, type Reporter } from "@/core/reporter";
import { NODE_RUNTIME_ID } from "@/runtimes/node/constants";
import { downloadNodeRuntime } from "@/runtimes/node/download";
import {
  fetchNodeReleases,
  selectLatestLts,
  selectNodeVersion,
} from "@/runtimes/node/releases";
import { pathExists, removePath } from "@/support/fs";
import type { ShimPaths } from "@/support/paths";
import { runCommand } from "@/support/process";
export type { NodeRelease } from "@/runtimes/node/types";
export { fetchNodeReleases, selectLatestLts, selectNodeVersion };

export const nodeRuntimePath = (paths: ShimPaths, version: string): string =>
  join(paths.runtimes, NODE_RUNTIME_ID, version);

export const nodeBinPath = (paths: ShimPaths, version: string): string =>
  join(nodeRuntimePath(paths, version), "bin", "node");

export const npmBinPath = (paths: ShimPaths, version: string): string =>
  join(nodeRuntimePath(paths, version), "bin", "npm");

type EnsureNodeRuntimeInput = {
  paths: ShimPaths;
  config: NodeRuntimeConfig;
  version: string;
  reporter?: Reporter;
};

export const ensureNodeRuntime = async ({
  paths,
  config,
  version,
  reporter = silentReporter,
}: EnsureNodeRuntimeInput): Promise<void> => {
  const runtimePath = nodeRuntimePath(paths, version);

  const nodePath = nodeBinPath(paths, version);
  const npmPath = npmBinPath(paths, version);

  if ((await pathExists(nodePath)) && (await pathExists(npmPath))) {
    reporter.info(`Found node ${version} at ${runtimePath}`);

    return;
  }

  if (await pathExists(runtimePath)) {
    reporter.info(`Replacing incomplete node ${version} at ${runtimePath}`);
    await removePath(runtimePath);
  }

  reporter.info(`Installing node ${version} at ${runtimePath}`);
  await downloadNodeRuntime({ paths, config, version, runtimePath, reporter });
  reporter.info(`Installed node ${version} at ${runtimePath}`);
};

export const ensureBootstrapNode = async (
  paths: ShimPaths,
  config: NodeRuntimeConfig,
  reporter: Reporter = silentReporter,
): Promise<string> => {
  const releases = await fetchNodeReleases(config);
  const version = config.bootstrapVersion ?? selectLatestLts(releases);

  await ensureNodeRuntime({ paths, config, version, reporter });

  return version;
};

export const readNodeVersion = async (nodePath: string): Promise<string> => {
  const { stdout } = await runCommand(nodePath, ["--version"]);

  return stdout.trim().replace(/^v/, "");
};
