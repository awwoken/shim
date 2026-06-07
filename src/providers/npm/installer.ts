import { delimiter, dirname } from "node:path";

import type { ShimConfig } from "@/core/config";
import { nodeBinPath, npmBinPath } from "@/runtimes/node";
import type { ShimPaths } from "@/support/paths";
import { runCommand } from "@/support/process";

import { NPM_PROVIDER_ID } from "./constants";

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
