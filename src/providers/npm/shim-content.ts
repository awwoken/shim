import { join } from "node:path";

import type { RegistryTool, ShimMetadata } from "@/core/models";
import { nodeBinPath } from "@/runtimes/node";
import { renderExpectedNodeExecutableShim } from "@/runtimes/node/shims";
import type { ShimPaths } from "@/support/paths";

import { npmExposedNodeModulesPath } from "./exposure";

export type ExpectedNpmShimContentInput = {
  paths: ShimPaths;
  tool: RegistryTool;
  metadata: ShimMetadata;
  binName: string;
};

export const npmShimPath = (paths: ShimPaths, binName: string): string =>
  join(paths.bin, binName);

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

  return renderExpectedNodeExecutableShim({
    type: binMetadata.type,
    sourceBinPath: join(tool.toolPath, binMetadata.source),
    targetPath:
      binMetadata.target === undefined
        ? undefined
        : join(tool.toolPath, binMetadata.target),
    nodePath: nodeBinPath(paths, tool.runtime.version),
    nodeModulesPath: npmExposedNodeModulesPath(paths),
  });
};
