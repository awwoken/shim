import { lstat, readlink, symlink } from "node:fs/promises";
import { dirname, isAbsolute, join, resolve } from "node:path";

import type { Registry, RegistryTool } from "@/core/models";
import type { Reporter } from "@/core/reporter";
import { AppError } from "@/support/errors";
import { ensureDir, removePath } from "@/support/fs";
import { isExpectedFsProbeError } from "@/support/fs/errors";
import type { ShimPaths } from "@/support/paths";

import { NPM_PROVIDER_ID } from "./constants";
import { npmExposedPackageLinkPath } from "./exposure";
import { hasManagedNpmToolAncestor } from "./path-safety";
import { npmPrefixPath, npmToolPath, packagePathSegments } from "./paths";

type ProjectedExposureLinkState =
  | "managed"
  | "missing"
  | "unmanaged"
  | "unsafe";

const toolNodeModulesPath = (paths: ShimPaths, tool: RegistryTool): string =>
  join(
    npmPrefixPath(paths, tool.packageName, tool.packageVersion),
    "lib",
    "node_modules",
  );

const projectedExposureLinkPath = (
  paths: ShimPaths,
  tool: RegistryTool,
  packageName: string,
): string =>
  join(toolNodeModulesPath(paths, tool), ...packagePathSegments(packageName));

const projectedExposureLinkState = async (
  paths: ShimPaths,
  tool: RegistryTool,
  packageName: string,
): Promise<ProjectedExposureLinkState> => {
  const linkPath = projectedExposureLinkPath(paths, tool, packageName);
  const toolPath = npmToolPath(paths, tool.packageName, tool.packageVersion);

  if (!hasManagedNpmToolAncestor(paths, toolPath, dirname(linkPath))) {
    return "unsafe";
  }

  try {
    const stats = await lstat(linkPath);

    if (!stats.isSymbolicLink()) {
      return "unmanaged";
    }
  } catch (caughtError) {
    if (isExpectedFsProbeError(caughtError)) {
      return "missing";
    }

    throw caughtError;
  }

  const target = await readlink(linkPath);
  const absoluteTarget = isAbsolute(target)
    ? target
    : resolve(dirname(linkPath), target);

  return resolve(absoluteTarget) ===
    resolve(npmExposedPackageLinkPath(paths, packageName))
    ? "managed"
    : "unmanaged";
};

const ensureProjectedExposureLink = async ({
  paths,
  tool,
  packageName,
  reporter,
}: {
  paths: ShimPaths;
  tool: RegistryTool;
  packageName: string;
  reporter: Reporter;
}): Promise<void> => {
  if (tool.packageName === packageName) {
    return;
  }

  const linkPath = projectedExposureLinkPath(paths, tool, packageName);
  const state = await projectedExposureLinkState(paths, tool, packageName);

  if (state === "managed") {
    return;
  }

  if (state === "unsafe") {
    reporter.info(
      `Skipped exposing ${packageName} to ${tool.packageName}; ${linkPath} has an unsafe filesystem ancestor`,
    );
    return;
  }

  if (state === "unmanaged") {
    reporter.info(
      `Skipped exposing ${packageName} to ${tool.packageName}; ${linkPath} already exists`,
    );
    return;
  }

  await ensureDir(dirname(linkPath));
  await symlink(npmExposedPackageLinkPath(paths, packageName), linkPath, "dir");
  reporter.info(`Exposed npm package ${packageName} to ${tool.packageName}`);
};

const removeProjectedExposureLink = async ({
  paths,
  tool,
  packageName,
  reporter,
}: {
  paths: ShimPaths;
  tool: RegistryTool;
  packageName: string;
  reporter: Reporter;
}): Promise<void> => {
  const state = await projectedExposureLinkState(paths, tool, packageName);

  if (state === "unsafe") {
    const linkPath = projectedExposureLinkPath(paths, tool, packageName);
    reporter.info(
      `Skipped removing exposed ${packageName} from ${tool.packageName}; ${linkPath} has an unsafe filesystem ancestor`,
    );
    return;
  }

  if (state !== "managed") {
    return;
  }

  const linkPath = projectedExposureLinkPath(paths, tool, packageName);
  await removePath(linkPath);
  reporter.info(
    `Removed exposed npm package ${packageName} from ${tool.packageName}`,
  );
};

const hasValidNpmToolPath = (
  paths: ShimPaths,
  tool: RegistryTool,
  reporter: Reporter,
): boolean => {
  try {
    npmToolPath(paths, tool.packageName, tool.packageVersion);
    return true;
  } catch (caughtError) {
    if (caughtError instanceof AppError) {
      reporter.info(
        `Skipped exposure sync for ${tool.id}; ${caughtError.message}`,
      );
      return false;
    }

    throw caughtError;
  }
};

const hasValidNpmPackageName = (
  packageName: string,
  reporter: Reporter,
): boolean => {
  try {
    packagePathSegments(packageName);
    return true;
  } catch (caughtError) {
    if (caughtError instanceof AppError) {
      reporter.info(
        `Skipped exposure sync for ${packageName}; ${caughtError.message}`,
      );
      return false;
    }

    throw caughtError;
  }
};

const registryNpmTools = (
  paths: ShimPaths,
  registry: Registry,
  reporter: Reporter,
): RegistryTool[] =>
  Object.values(registry.tools).filter(
    (tool) =>
      tool.provider === NPM_PROVIDER_ID &&
      hasValidNpmToolPath(paths, tool, reporter),
  );

const exposedNpmPackageNames = (tools: RegistryTool[]): string[] =>
  tools
    .filter((tool) => tool.installPolicy?.expose === true)
    .map((tool) => tool.packageName);

export const syncNpmExposureLinks = async ({
  paths,
  registry,
  packageNames,
  reporter,
}: {
  paths: ShimPaths;
  registry: Registry;
  packageNames?: string[];
  reporter: Reporter;
}): Promise<void> => {
  const tools = registryNpmTools(paths, registry, reporter).toSorted(
    (left, right) => left.packageName.localeCompare(right.packageName),
  );
  const exposedPackageNameSet = new Set(exposedNpmPackageNames(tools));
  const packageNameSet = new Set([
    ...exposedPackageNameSet,
    ...(packageNames ?? []).filter((packageName) =>
      hasValidNpmPackageName(packageName, reporter),
    ),
  ]);

  for (const packageName of [...packageNameSet].toSorted()) {
    for (const tool of tools) {
      if (exposedPackageNameSet.has(packageName)) {
        await ensureProjectedExposureLink({
          paths,
          tool,
          packageName,
          reporter,
        });
      } else {
        await removeProjectedExposureLink({
          paths,
          tool,
          packageName,
          reporter,
        });
      }
    }
  }
};
