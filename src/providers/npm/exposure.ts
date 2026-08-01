import { randomUUID } from "node:crypto";
import { lstat, rename, symlink } from "node:fs/promises";
import { dirname, join } from "node:path";

import type { Reporter } from "@/core/reporter";
import { AppError } from "@/support/errors";
import { ensureDir, removePath } from "@/support/fs";
import { isExpectedFsProbeError } from "@/support/fs/errors";
import type { ShimPaths } from "@/support/paths";

import { hasPathAncestorInsideRoot } from "./path-safety";
import { npmPrefixPath, packagePathSegments } from "./paths";

export type NpmExposureBackup = {
  rootPath: string;
  linkPath: string;
  backupPath?: string;
};

export const npmExposedNodeModulesPath = (paths: ShimPaths): string =>
  join(paths.home, "npm", "exposed", "node_modules");

export const npmExposedPackageLinkPath = (
  paths: ShimPaths,
  packageName: string,
): string =>
  join(npmExposedNodeModulesPath(paths), ...packagePathSegments(packageName));

const installedPackageModulePath = (
  paths: ShimPaths,
  packageName: string,
  packageVersion: string,
): string =>
  join(
    npmPrefixPath(paths, packageName, packageVersion),
    "lib",
    "node_modules",
    ...packagePathSegments(packageName),
  );

const assertManagedExposurePath = (
  rootPath: string,
  linkPath: string,
): void => {
  if (hasPathAncestorInsideRoot(rootPath, dirname(linkPath))) {
    return;
  }

  throw new AppError(
    `Unsafe npm exposure path ${linkPath}`,
    "Remove symlinked exposure directories that point outside the shim home.",
  );
};

const pathExistsWithoutFollowing = async (path: string): Promise<boolean> => {
  try {
    await lstat(path);

    return true;
  } catch (caughtError) {
    if (isExpectedFsProbeError(caughtError)) {
      return false;
    }

    throw caughtError;
  }
};

export const backupExposedNpmPackage = async (
  paths: ShimPaths,
  packageName: string,
): Promise<NpmExposureBackup> => {
  const rootPath = paths.home;
  const linkPath = npmExposedPackageLinkPath(paths, packageName);
  assertManagedExposurePath(rootPath, linkPath);

  if (!(await pathExistsWithoutFollowing(linkPath))) {
    return { rootPath, linkPath };
  }

  const backupPath = join(dirname(linkPath), `.shim-exposure-${randomUUID()}`);
  await rename(linkPath, backupPath);

  return { rootPath, linkPath, backupPath };
};

export const restoreExposedNpmPackageBackup = async ({
  rootPath,
  linkPath,
  backupPath,
}: NpmExposureBackup): Promise<void> => {
  assertManagedExposurePath(rootPath, linkPath);
  await removePath(linkPath);

  if (backupPath !== undefined) {
    await rename(backupPath, linkPath);
  }
};

export const removeExposedNpmPackageBackup = async ({
  rootPath,
  backupPath,
}: NpmExposureBackup): Promise<void> => {
  if (backupPath !== undefined) {
    assertManagedExposurePath(rootPath, backupPath);
    await removePath(backupPath);
  }
};

export const exposeNpmPackage = async ({
  paths,
  packageName,
  packageVersion,
  reporter,
}: {
  paths: ShimPaths;
  packageName: string;
  packageVersion: string;
  reporter: Reporter;
}): Promise<void> => {
  const targetPath = installedPackageModulePath(
    paths,
    packageName,
    packageVersion,
  );
  const linkPath = npmExposedPackageLinkPath(paths, packageName);
  assertManagedExposurePath(paths.home, linkPath);

  if (!(await pathExistsWithoutFollowing(targetPath))) {
    throw new AppError(
      `Cannot expose ${packageName}@${packageVersion}; package module was not installed`,
      `Expected package module at ${targetPath}`,
    );
  }

  await ensureDir(dirname(linkPath));
  await removePath(linkPath);
  await symlink(targetPath, linkPath, "dir");
  reporter.info(`Exposed npm package ${packageName} at ${linkPath}`);
};

export const removeExposedNpmPackage = async ({
  paths,
  packageName,
  reporter,
}: {
  paths: ShimPaths;
  packageName: string;
  reporter: Reporter;
}): Promise<void> => {
  const linkPath = npmExposedPackageLinkPath(paths, packageName);
  assertManagedExposurePath(paths.home, linkPath);

  await removePath(linkPath);
  reporter.info(`Removed exposed npm package ${linkPath}`);
};

export type NpmExposureUpdate = {
  backup: NpmExposureBackup;
};

export const updateNpmPackageExposure = async ({
  paths,
  packageName,
  packageVersion,
  expose,
  reporter,
}: {
  paths: ShimPaths;
  packageName: string;
  packageVersion: string;
  expose: boolean;
  reporter: Reporter;
}): Promise<NpmExposureUpdate> => {
  const backup = await backupExposedNpmPackage(paths, packageName);

  try {
    if (expose) {
      await exposeNpmPackage({ paths, packageName, packageVersion, reporter });
    } else {
      await removeExposedNpmPackage({ paths, packageName, reporter });
    }
  } catch (caughtError) {
    await restoreExposedNpmPackageBackup(backup);

    throw caughtError;
  }

  return { backup };
};

export const rollbackNpmPackageExposureUpdate = async (
  update: NpmExposureUpdate | undefined,
): Promise<void> => {
  if (update !== undefined) {
    await restoreExposedNpmPackageBackup(update.backup);
  }
};

export const commitNpmPackageExposureUpdate = async (
  update: NpmExposureUpdate | undefined,
): Promise<void> => {
  if (update !== undefined) {
    await removeExposedNpmPackageBackup(update.backup);
  }
};
