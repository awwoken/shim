import { delimiter, dirname } from "node:path";

import type { ShimConfig } from "@/core/config";
import type { Reporter } from "@/core/reporter";
import {
  ensureNodeRuntime,
  fetchNodeReleases,
  nodeBinPath,
  npmBinPath,
  selectNodeVersion,
} from "@/runtimes/node";
import { NODE_RUNTIME_ID } from "@/runtimes/node/constants";
import type { ShimPaths } from "@/support/paths";
import { runCommand } from "@/support/process";

import { NPM_PROVIDER_ID } from "./constants";

export type SelectNpmInstallNodeVersionInput = {
  paths: ShimPaths;
  config: ShimConfig;
  enginesNode: string | undefined;
  runtimeOverride: string | undefined;
  reporter: Reporter;
};

export const selectNpmInstallNodeVersion = async ({
  paths,
  config,
  enginesNode,
  runtimeOverride,
  reporter,
}: SelectNpmInstallNodeVersionInput): Promise<string> => {
  const nodeConfig = config.runtimes[NODE_RUNTIME_ID];
  const releases = await fetchNodeReleases(nodeConfig);
  const bootstrapNode = selectNodeVersion(
    releases,
    undefined,
    nodeConfig.bootstrapVersion,
  );
  const targetNode = selectNodeVersion(releases, enginesNode, runtimeOverride);

  if (runtimeOverride !== undefined) {
    reporter.info(
      `Using runtime override ${runtimeOverride}; selected node ${targetNode}`,
    );
  } else if (enginesNode === undefined) {
    reporter.info(
      `Package did not declare node requirement; selected node ${targetNode}`,
    );
  } else {
    reporter.info(
      `Package requires node ${enginesNode}; selected node ${targetNode}`,
    );
  }

  if (targetNode !== bootstrapNode) {
    await ensureNodeRuntime({
      paths,
      config: nodeConfig,
      version: targetNode,
      reporter,
    });
  }

  return targetNode;
};

export type RunNpmInstallInput = {
  paths: ShimPaths;
  config: ShimConfig;
  nodeVersion: string;
  prefixPath: string;
  packageName: string;
  packageVersion: string;
  ignoreScripts: boolean;
};

const copyCurrentEnvironment = (): Record<string, string> => {
  const env: Record<string, string> = {};

  for (const [key, value] of Object.entries(Bun.env)) {
    if (value !== undefined) {
      env[key] = value;
    }
  }

  return env;
};

const prependPath = (entry: string, path: string | undefined): string => {
  if (path === undefined || path === "") {
    return entry;
  }

  return `${entry}${delimiter}${path}`;
};

const createManagedNodeEnvironment = (
  nodePath: string,
): Record<string, string> => {
  const env = copyCurrentEnvironment();
  env["PATH"] = prependPath(dirname(nodePath), env["PATH"]);

  return env;
};

export const runNpmInstall = async ({
  paths,
  config,
  nodeVersion,
  prefixPath,
  packageName,
  packageVersion,
  ignoreScripts,
}: RunNpmInstallInput): Promise<void> => {
  const args = [
    "install",
    "-g",
    `${packageName}@${packageVersion}`,
    "--prefix",
    prefixPath,
    "--registry",
    config.providers[NPM_PROVIDER_ID].registry,
    "--no-audit",
    "--no-fund",
  ];

  if (ignoreScripts) {
    args.push("--ignore-scripts");
  }

  const nodePath = nodeBinPath(paths, nodeVersion);

  await runCommand(nodePath, [npmBinPath(paths, nodeVersion), ...args], {
    env: createManagedNodeEnvironment(nodePath),
  });
};
