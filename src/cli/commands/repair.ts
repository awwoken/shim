import { writeOut } from "@/cli/output";
import { colorProgress, colorSuccess, colorWarning } from "@/cli/output/colors";
import type { Registry, RegistryTool, ShimMetadata } from "@/core/models";
import { loadRegistry } from "@/core/registry";
import type { RepairResult } from "@/core/repair";
import { providerShimRepairers } from "@/providers/repair";
import { isEmptyArray } from "@/support/collections";
import { readJsonFile } from "@/support/fs";
import { withMutationLock } from "@/support/lock";
import { getShimPaths, type ShimPaths } from "@/support/paths";
import type { Command } from "commander";

const metadataMissingResult = (tool: RegistryTool): RepairResult => ({
  status: "skipped",
  message: `Skipped ${tool.packageName}@${tool.packageVersion}; metadata is missing`,
  hint: "Reinstall the tool or remove stale registry state.",
});

const metadataMalformedResult = (tool: RegistryTool): RepairResult => ({
  status: "skipped",
  message: `Skipped ${tool.packageName}@${tool.packageVersion}; metadata is malformed`,
  hint: "Reinstall the tool or remove stale registry state.",
});

const unsupportedProviderResult = (
  tool: RegistryTool,
  binName: string,
): RepairResult => ({
  status: "skipped",
  message: `Skipped ${binName}; provider ${tool.provider} does not support repair`,
  hint: "Install a shim version that supports this provider or remove the affected tool.",
});

const binNotOwnedResult = (
  tool: RegistryTool,
  binName: string,
): RepairResult => ({
  status: "skipped",
  message: `Skipped ${binName}; registry does not assign this shim to ${tool.id}`,
  hint: "Reinstall the tool or remove stale registry state.",
});

const repairBinNames = (registry: Registry, tool: RegistryTool): string[] => {
  const canonicalBinNames = Object.entries(registry.bins)
    .filter(([, bin]) => bin.toolId === tool.id)
    .map(([binName]) => binName);

  return [...new Set([...tool.bins, ...canonicalBinNames])].toSorted();
};

const repairTool = async (
  paths: ShimPaths,
  registry: Registry,
  tool: RegistryTool,
): Promise<RepairResult[]> => {
  let metadata: ShimMetadata | undefined;

  try {
    metadata = await readJsonFile<ShimMetadata>(tool.metadataPath);
  } catch (caughtError) {
    if (caughtError instanceof SyntaxError) {
      return [metadataMalformedResult(tool)];
    }

    throw caughtError;
  }

  if (metadata === undefined) {
    return [metadataMissingResult(tool)];
  }

  const repairer = providerShimRepairers[tool.provider];

  return await Promise.all(
    repairBinNames(registry, tool).map(
      async (binName): Promise<RepairResult> => {
        if (registry.bins[binName]?.toolId !== tool.id) {
          return binNotOwnedResult(tool, binName);
        }

        if (repairer === undefined) {
          return unsupportedProviderResult(tool, binName);
        }

        return await repairer({ paths, tool, metadata, binName });
      },
    ),
  );
};

const repairInstalledShims = async (
  paths: ShimPaths,
): Promise<RepairResult[]> => {
  const registry = await loadRegistry(paths);
  const tools = Object.values(registry.tools).toSorted((left, right) =>
    left.id.localeCompare(right.id),
  );
  const results = await Promise.all(
    tools.map(async (tool) => await repairTool(paths, registry, tool)),
  );

  return results.flat();
};

const colorRepairMessage = (result: RepairResult): string => {
  if (result.status === "repaired") {
    return colorSuccess(result.message);
  }

  if (result.status === "skipped") {
    return colorWarning(result.message);
  }

  return colorProgress(result.message);
};

const renderRepairResult = (result: RepairResult): string => {
  const message = colorRepairMessage(result);

  return result.hint === undefined ? message : `${message}\n  ${result.hint}`;
};

const renderRepairResults = (results: RepairResult[]): string => {
  if (isEmptyArray(results)) {
    return "No tools installed.";
  }

  return results.map(renderRepairResult).join("\n");
};

export const registerRepairCommand = (program: Command): void => {
  program
    .command("repair")
    .description("repair generated shim files from registry metadata")
    .action(async (): Promise<void> => {
      const paths = getShimPaths();
      const results = await withMutationLock(
        paths,
        async () => await repairInstalledShims(paths),
      );

      writeOut(renderRepairResults(results));

      if (results.some((result) => result.status === "skipped")) {
        process.exitCode = 1;
      }
    });
};
