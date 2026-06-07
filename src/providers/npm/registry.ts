import { join } from "node:path";

import type { RegistryTool, ShimMetadata } from "@/core/models";
import { getToolId } from "@/core/registry";
import { NODE_RUNTIME_ID } from "@/runtimes/node/constants";
import type { ShimPaths } from "@/support/paths";

import { NPM_PROVIDER_ID } from "./constants";
import { npmToolPath } from "./paths";

export const getNpmToolId = (packageName: string): RegistryTool["id"] =>
  getToolId(NPM_PROVIDER_ID, packageName);

type CreateInitialMetadataInput = {
  packageName: string;
  packageVersion: string;
  packageSpec: string;
  nodeVersion: string;
  enginesNode: string | undefined;
};

export const createInitialMetadata = ({
  packageName,
  packageVersion,
  packageSpec,
  nodeVersion,
  enginesNode,
}: CreateInitialMetadataInput): ShimMetadata => ({
  provider: NPM_PROVIDER_ID,
  packageName,
  packageVersion,
  packageSpec,
  runtime: { kind: NODE_RUNTIME_ID, version: nodeVersion },
  runtimeData: { enginesNode },
  installedAt: new Date().toISOString(),
  bins: {},
});

export type CreateNpmRegistryToolInput = {
  paths: ShimPaths;
  packageName: string;
  packageVersion: string;
  packageSpec: string;
  nodeVersion: string;
  installedAt: string;
  binNames: string[];
};

export const createNpmRegistryTool = ({
  paths,
  packageName,
  packageVersion,
  packageSpec,
  nodeVersion,
  installedAt,
  binNames,
}: CreateNpmRegistryToolInput): RegistryTool => {
  const toolPath = npmToolPath(paths, packageName, packageVersion);

  return {
    id: getNpmToolId(packageName),
    provider: NPM_PROVIDER_ID,
    packageName,
    packageVersion,
    packageSpec,
    runtime: { kind: NODE_RUNTIME_ID, version: nodeVersion },
    installedAt,
    toolPath,
    metadataPath: join(toolPath, "shim.json"),
    bins: binNames,
  };
};
