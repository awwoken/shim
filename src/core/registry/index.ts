import type { ProviderId, Registry, RegistryTool, ToolId } from "@/core/models";
import { REGISTRY_SCHEMA_VERSION } from "@/core/registry/constants";
import { registrySchema } from "@/core/registry/schema";
import { AppError } from "@/support/errors";
import { pathExists, readJsonFile, writeJsonAtomic } from "@/support/fs";
import type { ShimPaths } from "@/support/paths";
import { parseJsonSchema } from "@/support/validation";

export const createEmptyRegistry = (): Registry => ({
  version: REGISTRY_SCHEMA_VERSION,
  tools: {},
  bins: {},
});

export const loadRegistry = async (paths: ShimPaths): Promise<Registry> => {
  const registry = await readJsonFile<unknown>(paths.registry);

  if (registry === undefined) {
    return createEmptyRegistry();
  }

  return parseJsonSchema({
    schema: registrySchema,
    value: registry,
    label: "registry file",
    path: paths.registry,
  });
};

export const saveRegistry = async (
  paths: ShimPaths,
  registry: Registry,
): Promise<void> => {
  await writeJsonAtomic(paths.registry, registry);
};

export const getToolId = (provider: ProviderId, packageName: string): ToolId =>
  `${provider}:${packageName}`;

export type UpsertToolResult = {
  registry: Registry;
  displacedTools: RegistryTool[];
};

export const upsertTool = (
  registry: Registry,
  tool: RegistryTool,
): UpsertToolResult => {
  const nextRegistry: Registry = {
    version: REGISTRY_SCHEMA_VERSION,
    tools: { ...registry.tools, [tool.id]: tool },
    bins: { ...registry.bins },
  };
  const displacedTools = new Map<ToolId, RegistryTool>();
  const previousActiveTool = registry.tools[tool.id];

  if (previousActiveTool !== undefined) {
    for (const binName of previousActiveTool.bins) {
      if (!tool.bins.includes(binName)) {
        Reflect.deleteProperty(nextRegistry.bins, binName);
      }
    }
  }

  for (const binName of tool.bins) {
    const previousOwner = nextRegistry.bins[binName];

    if (previousOwner !== undefined && previousOwner.toolId !== tool.id) {
      const previousTool = nextRegistry.tools[previousOwner.toolId];

      if (previousTool !== undefined) {
        displacedTools.set(previousTool.id, previousTool);
        Reflect.deleteProperty(nextRegistry.tools, previousTool.id);

        for (const previousBinName of previousTool.bins) {
          if (nextRegistry.bins[previousBinName]?.toolId === previousTool.id) {
            Reflect.deleteProperty(nextRegistry.bins, previousBinName);
          }
        }
      }
    }

    nextRegistry.bins[binName] = {
      provider: tool.provider,
      toolId: tool.id,
      packageName: tool.packageName,
      packageVersion: tool.packageVersion,
      shimPath: binName,
    };
  }

  return {
    registry: nextRegistry,
    displacedTools: [...displacedTools.values()],
  };
};

export const removeTool = (
  registry: Registry,
  toolId: ToolId,
): { registry: Registry; tool?: RegistryTool } => {
  const tool = registry.tools[toolId];

  if (tool === undefined) {
    return { registry };
  }

  const tools = { ...registry.tools };
  Reflect.deleteProperty(tools, toolId);

  const bins = { ...registry.bins };

  for (const binName of tool.bins) {
    if (bins[binName]?.toolId === toolId) {
      Reflect.deleteProperty(bins, binName);
    }
  }

  return { registry: { version: REGISTRY_SCHEMA_VERSION, tools, bins }, tool };
};

export const findToolByPackageOrBin = (
  registry: Registry,
  provider: ProviderId,
  packageOrBin: string,
): RegistryTool | undefined => {
  const tool = registry.tools[getToolId(provider, packageOrBin)];

  if (tool !== undefined) {
    return tool;
  }

  const bin = registry.bins[packageOrBin];

  if (bin === undefined || bin.provider !== provider) {
    return undefined;
  }

  return registry.tools[bin.toolId];
};

type BinConflictInput = {
  paths: ShimPaths;
  registry: Registry;
  binNames: string[];
  force: boolean;
  replaceToolId?: ToolId;
};

export const checkBinConflicts = async ({
  paths,
  registry,
  binNames,
  force,
  replaceToolId,
}: BinConflictInput): Promise<void> => {
  if (force && replaceToolId === undefined) {
    return;
  }

  for (const binName of binNames) {
    const owner = registry.bins[binName];

    if (owner !== undefined) {
      if (owner.toolId === replaceToolId) {
        continue;
      }

      throw new AppError(
        `Bin "${binName}" is already installed by ${owner.packageName}@${owner.packageVersion}`,
        "Use --force to replace it",
      );
    }

    if (await pathExists(`${paths.bin}/${binName}`)) {
      throw new AppError(
        `Bin "${binName}" already exists in ${paths.bin}`,
        "Remove it or use --force to replace it",
      );
    }
  }
};
