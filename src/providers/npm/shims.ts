import { readdir } from "node:fs/promises";
import { join, relative } from "node:path";

import type { RegistryTool, ShimMetadata } from "@/core/models";
import type { Reporter } from "@/core/reporter";
import { nodeBinPath } from "@/runtimes/node";
import { createNodeExecutableShim } from "@/runtimes/node/shims";
import { hasOneItem, isEmptyArray } from "@/support/collections";
import { AppError, toErrorMessage } from "@/support/errors";
import { assertDirectory, removePath } from "@/support/fs";
import type { ShimPaths } from "@/support/paths";

import { npmPackageRoot, npmToolPath } from "./paths";

export type CreateNpmShimsInput = {
  paths: ShimPaths;
  packageName: string;
  packageVersion: string;
  nodeVersion: string;
  binNames: string[];
  reporter: Reporter;
};

export const discoverNpmBinNames = async (
  prefixPath: string,
): Promise<string[]> => {
  const binPath = join(prefixPath, "bin");

  if (!(await assertDirectory(binPath))) {
    throw new AppError("Installed package did not create any bins");
  }

  const entries = await readdir(binPath);
  const binNames = entries.filter((entry) => !entry.endsWith(".cmd"));

  if (isEmptyArray(binNames)) {
    throw new AppError("Installed package did not create any bins");
  }

  return binNames.toSorted();
};

export const renderNpmExecutableSummary = (binNames: string[]): string => {
  const executableLabel = hasOneItem(binNames) ? "executable" : "executables";

  return `Found ${executableLabel} ${binNames.join(", ")}`;
};

export const createNpmShims = async ({
  paths,
  packageName,
  packageVersion,
  nodeVersion,
  binNames,
  reporter,
}: CreateNpmShimsInput): Promise<ShimMetadata["bins"]> => {
  const bins: ShimMetadata["bins"] = {};
  const toolPath = npmToolPath(paths, packageName, packageVersion);
  const prefixPath = join(toolPath, "npm-prefix");
  const nodePath = nodeBinPath(paths, nodeVersion);

  for (const binName of binNames) {
    const sourcePath = join(prefixPath, "bin", binName);
    const shimPath = join(paths.bin, binName);
    const metadata = await createNodeExecutableShim(
      shimPath,
      sourcePath,
      nodePath,
    );

    reporter.info(`Created shim ${shimPath} -> ${sourcePath}`);

    bins[binName] = {
      ...metadata,
      source: relative(toolPath, sourcePath),
      target:
        metadata.target === undefined
          ? undefined
          : relative(toolPath, metadata.target),
    };
  }

  return bins;
};

type RemoveStaleNpmShimsInput = {
  paths: ShimPaths;
  previousBins: string[];
  nextBins: string[];
  reporter: Reporter;
};

export const removeStaleNpmShims = async ({
  paths,
  previousBins,
  nextBins,
  reporter,
}: RemoveStaleNpmShimsInput): Promise<void> => {
  for (const binName of previousBins) {
    if (!nextBins.includes(binName)) {
      const shimPath = join(paths.bin, binName);
      await removePath(shimPath);
      reporter.info(`Removed stale shim ${shimPath}`);
    }
  }
};

type RemoveDisplacedNpmToolsInput = {
  paths: ShimPaths;
  tools: RegistryTool[];
  retainedBins: string[];
  reporter: Reporter;
};

export const removeDisplacedNpmTools = async ({
  paths,
  tools,
  retainedBins,
  reporter,
}: RemoveDisplacedNpmToolsInput): Promise<void> => {
  const retainedBinSet = new Set(retainedBins);

  for (const tool of tools) {
    for (const binName of tool.bins) {
      if (retainedBinSet.has(binName)) {
        continue;
      }

      const shimPath = join(paths.bin, binName);

      try {
        await removePath(shimPath);
        reporter.info(`Removed displaced shim ${shimPath}`);
      } catch (caughtError) {
        reporter.info(
          `Could not remove displaced shim ${shimPath}: ${toErrorMessage(caughtError)}`,
        );
      }
    }

    const packageRoot = npmPackageRoot(paths, tool.packageName);

    try {
      await removePath(packageRoot);
      reporter.info(`Removed displaced package root ${packageRoot}`);
    } catch (caughtError) {
      reporter.info(
        `Could not remove displaced package root ${packageRoot}: ${toErrorMessage(caughtError)}`,
      );
    }
  }
};
