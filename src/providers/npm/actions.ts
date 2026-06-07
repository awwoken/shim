import { join } from "node:path";

import type { ShimConfig } from "@/core/config";
import type { RegistryBin, RegistryTool } from "@/core/models";
import {
  findToolByPackageOrBin,
  loadRegistry,
  removeTool,
  saveRegistry,
} from "@/core/registry";
import type { Reporter } from "@/core/reporter";
import type { UpgradeResult } from "@/providers/types";
import { AppError } from "@/support/errors";
import { removePath } from "@/support/fs";
import type { ShimPaths } from "@/support/paths";

import { NPM_PROVIDER_ID } from "./constants";
import { installNpmPackage } from "./install";
import { resolveNpmPackage } from "./metadata";
import { npmPackageRoot } from "./paths";

const selectUpgradeTargets = (
  tools: Record<string, RegistryTool>,
  packageOrBin: string | undefined,
  bins: Record<string, RegistryBin>,
): RegistryTool[] => {
  if (packageOrBin === undefined) {
    return Object.values(tools).filter(
      (tool) => tool.provider === NPM_PROVIDER_ID,
    );
  }

  const bin = bins[packageOrBin];

  if (bin !== undefined) {
    const tool = tools[bin.toolId];

    if (tool !== undefined && tool.provider === NPM_PROVIDER_ID) {
      return [tool];
    }
  }

  const tool = tools[`${NPM_PROVIDER_ID}:${packageOrBin}`];

  if (tool === undefined) {
    throw new AppError(`No installed package or bin matched "${packageOrBin}"`);
  }

  return [tool];
};

export const removeNpmTool = async (
  paths: ShimPaths,
  packageOrBin: string,
  reporter: Reporter,
): Promise<RegistryTool> => {
  const registry = await loadRegistry(paths);
  const tool = findToolByPackageOrBin(registry, NPM_PROVIDER_ID, packageOrBin);

  if (tool === undefined) {
    throw new AppError(`No installed package or bin matched "${packageOrBin}"`);
  }

  for (const binName of tool.bins) {
    const shimPath = join(paths.bin, binName);
    await removePath(shimPath);
    reporter.info(`Removed shim ${shimPath}`);
  }

  const packageRoot = npmPackageRoot(paths, tool.packageName);
  await removePath(packageRoot);
  reporter.info(`Removed package root ${packageRoot}`);

  const result = removeTool(registry, tool.id);
  await saveRegistry(paths, result.registry);
  reporter.info(`Updated registry ${paths.registry}`);

  return tool;
};

type UpgradeNpmToolsInput = {
  paths: ShimPaths;
  config: ShimConfig;
  packageOrBin: string | undefined;
  reporter: Reporter;
};

export const upgradeNpmTools = async ({
  paths,
  config,
  packageOrBin,
  reporter,
}: UpgradeNpmToolsInput): Promise<UpgradeResult[]> => {
  const registry = await loadRegistry(paths);
  const tools = selectUpgradeTargets(
    registry.tools,
    packageOrBin,
    registry.bins,
  );
  const results: UpgradeResult[] = [];

  for (const tool of tools) {
    const latest = await resolveNpmPackage({
      paths,
      config,
      packageSpec: `${tool.packageName}@latest`,
      reporter,
    });

    if (latest.version === tool.packageVersion) {
      results.push({
        packageName: tool.packageName,
        previousVersion: tool.packageVersion,
        nextVersion: latest.version,
        changed: false,
      });
      continue;
    }

    await installNpmPackage({
      paths,
      config,
      packageSpec: `${tool.packageName}@${latest.version}`,
      options: {
        force: true,
        ignoreScripts: false,
        replaceToolId: tool.id,
      },
      reporter,
    });

    results.push({
      packageName: tool.packageName,
      previousVersion: tool.packageVersion,
      nextVersion: latest.version,
      changed: true,
    });
  }

  return results;
};
