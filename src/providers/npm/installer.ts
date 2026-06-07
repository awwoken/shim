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

  await runCommand(nodeBinPath(paths, nodeVersion), [
    npmBinPath(paths, nodeVersion),
    ...args,
  ]);
};
