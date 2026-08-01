import { isAbsolute, join, resolve } from "node:path";

import type { BinMetadata, RegistryTool, ShimMetadata } from "@/core/models";
import { nodeBinPath } from "@/runtimes/node";
import { renderExpectedNodeExecutableShim } from "@/runtimes/node/shims";
import { AppError } from "@/support/errors";
import type { ShimPaths } from "@/support/paths";

import { npmExposedNodeModulesPath } from "./exposure";
import { isExistingPathInsideManagedNpmTool } from "./path-safety";
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
  if (!isRecord(metadata)) {
    return undefined;
  }

  const { bins } = metadata;

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

const resolveMetadataNodePath = (
  paths: ShimPaths,
  tool: RegistryTool,
): string | undefined => {
  try {
    return nodeBinPath(paths, tool.runtime.version);
  } catch (caughtError) {
    if (caughtError instanceof AppError) {
      return undefined;
    }

    throw caughtError;
  }
};

const resolveMetadataPath = (
  paths: ShimPaths,
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

  return isExistingPathInsideManagedNpmTool(paths, toolPath, resolvedPath)
    ? resolvedPath
    : undefined;
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
  const nodePath = resolveMetadataNodePath(paths, tool);
  const sourceBinPath =
    toolPath === undefined
      ? undefined
      : resolveMetadataPath(paths, toolPath, binMetadata.source);
  const targetPath =
    toolPath === undefined || binMetadata.target === undefined
      ? undefined
      : resolveMetadataPath(paths, toolPath, binMetadata.target);

  if (
    toolPath === undefined ||
    nodePath === undefined ||
    sourceBinPath === undefined ||
    (binMetadata.target !== undefined && targetPath === undefined)
  ) {
    return undefined;
  }

  return renderExpectedNodeExecutableShim({
    type: binMetadata.type,
    sourceBinPath,
    targetPath,
    nodePath,
    nodeModulesPath: npmExposedNodeModulesPath(paths),
  });
};
