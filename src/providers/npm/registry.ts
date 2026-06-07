import { join } from "node:path";

import type { RegistryTool } from "@/core/models";
import { getToolId } from "@/core/registry";
import { NODE_RUNTIME_ID } from "@/runtimes/node/constants";
import type { ShimPaths } from "@/support/paths";

import { NPM_PROVIDER_ID } from "./constants";
import { npmToolPath } from "./paths";

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
    id: getToolId(NPM_PROVIDER_ID, packageName),
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
