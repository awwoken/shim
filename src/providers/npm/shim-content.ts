import { realpathSync } from "node:fs";
import { isAbsolute, join, relative, resolve } from "node:path";

import type { BinMetadata, RegistryTool, ShimMetadata } from "@/core/models";
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

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const metadataBinsRecord = (
  metadata: ShimMetadata,
): Record<string, unknown> | undefined => {
  const { bins } = metadata as { bins?: unknown };

  return isRecord(bins) ? bins : undefined;
};

export const hasNpmShimMetadataBins = (metadata: ShimMetadata): boolean =>
  metadataBinsRecord(metadata) !== undefined;

export const npmShimMetadataRecordsBin = (
  metadata: ShimMetadata,
  binName: string,
): boolean => metadataBinsRecord(metadata)?.[binName] !== undefined;

const readBinMetadata = (
  metadata: ShimMetadata,
  binName: string,
): BinMetadata | undefined => {
  const binMetadata = metadataBinsRecord(metadata)?.[binName];

  if (!isRecord(binMetadata)) {
    return undefined;
  }

  const { source, target, type } = binMetadata;

  if (
    typeof source !== "string" ||
    typeof type !== "string" ||
    (target !== undefined && typeof target !== "string")
  ) {
    return undefined;
  }

  return { source, target, type };
};

const pathIsInsideRoot = (rootPath: string, candidatePath: string): boolean => {
  const relativePath = relative(resolve(rootPath), resolve(candidatePath));

  return (
    relativePath !== "" &&
    !relativePath.startsWith("..") &&
    !isAbsolute(relativePath)
  );
};

const existingRealPathIsInsideRoot = (
  rootPath: string,
  candidatePath: string,
): boolean | undefined => {
  try {
    return pathIsInsideRoot(
      realpathSync.native(rootPath),
      realpathSync.native(candidatePath),
    );
  } catch (caughtError) {
    if (isExpectedFsProbeError(caughtError)) {
      return undefined;
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
  const realPathInside = existingRealPathIsInsideRoot(toolPath, resolvedPath);

  return realPathInside === true ? resolvedPath : undefined;
};

export const renderExpectedNpmShimContent = ({
  paths,
  tool,
  metadata,
  binName,
}: ExpectedNpmShimContentInput): string | undefined => {
  const binMetadata = readBinMetadata(metadata, binName);

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
