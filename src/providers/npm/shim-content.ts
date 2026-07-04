import { realpathSync } from "node:fs";
import { isAbsolute, join, relative, resolve } from "node:path";

import type { RegistryTool, ShimMetadata } from "@/core/models";
import { nodeBinPath } from "@/runtimes/node";
import { renderExpectedNodeExecutableShim } from "@/runtimes/node/shims";
import { AppError } from "@/support/errors";
import { isExpectedFsProbeError } from "@/support/fs/errors";
import type { ShimPaths } from "@/support/paths";

import { npmExposedNodeModulesPath } from "./exposure";
import { npmToolPath } from "./paths";

export type ExpectedNpmShimContentInput = {
  paths: ShimPaths;
  tool: RegistryTool;
  metadata: ShimMetadata;
  binName: string;
};

export const isSafeNpmBinName = (binName: string): boolean =>
  binName !== "" &&
  binName !== "." &&
  binName !== ".." &&
  !binName.includes("/") &&
  !binName.includes("\\") &&
  !binName.includes("\0");

export const npmShimPath = (paths: ShimPaths, binName: string): string =>
  join(paths.bin, binName);

const pathIsInsideRoot = (rootPath: string, candidatePath: string): boolean => {
  const relativePath = relative(resolve(rootPath), resolve(candidatePath));

  return (
    relativePath !== "" &&
    !relativePath.startsWith("..") &&
    !isAbsolute(relativePath)
  );
};

const realPathIsInsideRoot = (
  rootPath: string,
  candidatePath: string,
): boolean => {
  try {
    return pathIsInsideRoot(
      realpathSync.native(rootPath),
      realpathSync.native(candidatePath),
    );
  } catch (caughtError) {
    if (isExpectedFsProbeError(caughtError)) {
      return false;
    }

    throw caughtError;
  }
};

const resolveMetadataToolPath = (
  paths: ShimPaths,
  tool: RegistryTool,
): string | undefined => {
  try {
    return npmToolPath(paths, tool.packageName, tool.packageVersion);
  } catch (caughtError) {
    if (caughtError instanceof AppError) {
      return undefined;
    }

    throw caughtError;
  }
};

const resolveMetadataPath = (
  toolPath: string,
  metadataPath: unknown,
): string | undefined => {
  if (
    typeof metadataPath !== "string" ||
    metadataPath === "" ||
    metadataPath.includes("\0") ||
    isAbsolute(metadataPath)
  ) {
    return undefined;
  }

  const resolvedPath = resolve(toolPath, metadataPath);

  return pathIsInsideRoot(toolPath, resolvedPath) ||
    realPathIsInsideRoot(toolPath, resolvedPath)
    ? resolvedPath
    : undefined;
};

export const renderExpectedNpmShimContent = ({
  paths,
  tool,
  metadata,
  binName,
}: ExpectedNpmShimContentInput): string | undefined => {
  const binMetadata = metadata.bins[binName];

  if (binMetadata === undefined) {
    return undefined;
  }

  const toolPath = resolveMetadataToolPath(paths, tool);
  const sourceBinPath =
    toolPath === undefined
      ? undefined
      : resolveMetadataPath(toolPath, binMetadata.source);
  const targetPath =
    toolPath === undefined || binMetadata.target === undefined
      ? undefined
      : resolveMetadataPath(toolPath, binMetadata.target);

  if (
    toolPath === undefined ||
    sourceBinPath === undefined ||
    (binMetadata.target !== undefined && targetPath === undefined)
  ) {
    return undefined;
  }

  return renderExpectedNodeExecutableShim({
    type: binMetadata.type,
    sourceBinPath,
    targetPath,
    nodePath: nodeBinPath(paths, tool.runtime.version),
    nodeModulesPath: npmExposedNodeModulesPath(paths),
  });
};
