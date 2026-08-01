import { realpathSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";

import { isExpectedFsProbeError } from "@/support/fs/errors";
import { providerToolRoot, type ShimPaths } from "@/support/paths";

import { NPM_PROVIDER_ID } from "./constants";

const MISSING_PATH_ERROR_CODES = new Set(["ENOENT", "ENOTDIR"]);

type FsError = Error & {
  code?: string;
};

const isFsError = (error: unknown): error is FsError => error instanceof Error;

const isMissingPathError = (error: unknown): boolean =>
  isFsError(error) &&
  error.code !== undefined &&
  MISSING_PATH_ERROR_CODES.has(error.code);

const pathIsInsideRoot = (
  rootPath: string,
  candidatePath: string,
  allowRoot: boolean,
): boolean => {
  const relativePath = relative(resolve(rootPath), resolve(candidatePath));

  if (relativePath === "") {
    return allowRoot;
  }

  return (
    relativePath !== ".." &&
    !relativePath.startsWith(`..${sep}`) &&
    !isAbsolute(relativePath)
  );
};

const existingRealPath = (path: string): string | undefined => {
  try {
    return realpathSync.native(path);
  } catch (caughtError) {
    if (isExpectedFsProbeError(caughtError)) {
      return undefined;
    }

    throw caughtError;
  }
};

const existingRealPathIsInsideRoot = (
  rootPath: string,
  candidatePath: string,
): boolean => {
  const realRootPath = existingRealPath(rootPath);
  const realCandidatePath = existingRealPath(candidatePath);

  return (
    realRootPath !== undefined &&
    realCandidatePath !== undefined &&
    pathIsInsideRoot(realRootPath, realCandidatePath, false)
  );
};

const nearestExistingRealPath = (candidatePath: string): string | undefined => {
  const currentPath = resolve(candidatePath);

  try {
    return realpathSync.native(currentPath);
  } catch (caughtError) {
    if (!isMissingPathError(caughtError)) {
      if (isExpectedFsProbeError(caughtError)) {
        return undefined;
      }

      throw caughtError;
    }
  }

  const parentPath = dirname(currentPath);

  return parentPath === currentPath
    ? undefined
    : nearestExistingRealPath(parentPath);
};

export const isManagedNpmToolPath = (
  paths: ShimPaths,
  toolPath: string,
): boolean => {
  const providerRoot = providerToolRoot(paths, NPM_PROVIDER_ID);

  return (
    existingRealPathIsInsideRoot(paths.home, paths.tools) &&
    existingRealPathIsInsideRoot(paths.tools, providerRoot) &&
    existingRealPathIsInsideRoot(providerRoot, toolPath)
  );
};

export const isExistingPathInsideManagedNpmTool = (
  paths: ShimPaths,
  toolPath: string,
  candidatePath: string,
): boolean =>
  isManagedNpmToolPath(paths, toolPath) &&
  existingRealPathIsInsideRoot(toolPath, candidatePath);

export const hasManagedNpmToolAncestor = (
  paths: ShimPaths,
  toolPath: string,
  candidatePath: string,
): boolean => {
  if (
    !isManagedNpmToolPath(paths, toolPath) ||
    !pathIsInsideRoot(toolPath, candidatePath, false)
  ) {
    return false;
  }

  const realToolPath = existingRealPath(toolPath);
  const realAncestorPath = nearestExistingRealPath(candidatePath);

  return (
    realToolPath !== undefined &&
    realAncestorPath !== undefined &&
    pathIsInsideRoot(realToolPath, realAncestorPath, true)
  );
};
