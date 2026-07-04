import {
  writeJsonFile,
  type TestHome,
  readJsonFile,
} from "../filesystem/test-home";

type MutableRegistryTool = {
  metadataPath: string;
  toolPath: string;
  bins: string[];
};

type MutableRegistry = {
  tools: Record<string, MutableRegistryTool>;
} & Record<string, unknown>;

type MutableShimMetadata = {
  bins: Record<string, unknown>;
} & Record<string, unknown>;

const readMutableRegistryTool = async (
  home: TestHome,
  toolId: string,
): Promise<{ registry: MutableRegistry; tool: MutableRegistryTool }> => {
  const registry = await readJsonFile<MutableRegistry>(home.registry);
  const tool = registry.tools[toolId];

  if (tool === undefined) {
    throw new Error(`Expected registry tool ${toolId}`);
  }

  return { registry, tool };
};

const readMutableMetadata = async (
  metadataPath: string,
): Promise<MutableShimMetadata> =>
  await readJsonFile<MutableShimMetadata>(metadataPath);

const expectMutableBinMetadata = (
  metadata: MutableShimMetadata,
  binName: string,
): Record<string, unknown> => {
  const binMetadata = metadata.bins[binName];

  if (typeof binMetadata !== "object" || binMetadata === null) {
    throw new Error(`Expected shim metadata for ${binName}`);
  }

  return binMetadata as Record<string, unknown>;
};

export const addTraversalRepairBin = async ({
  home,
  toolId,
  sourceBinName,
  traversalBinName,
}: {
  home: TestHome;
  toolId: string;
  sourceBinName: string;
  traversalBinName: string;
}): Promise<void> => {
  const { registry, tool } = await readMutableRegistryTool(home, toolId);
  const metadata = await readMutableMetadata(tool.metadataPath);
  const sourceBinMetadata = expectMutableBinMetadata(metadata, sourceBinName);

  tool.bins = [...tool.bins, traversalBinName];
  metadata.bins[traversalBinName] = sourceBinMetadata;

  await writeJsonFile(home.registry, registry);
  await writeJsonFile(tool.metadataPath, metadata);
};

export const setRegistryToolPath = async ({
  home,
  toolId,
  toolPath,
}: {
  home: TestHome;
  toolId: string;
  toolPath: string;
}): Promise<void> => {
  const { registry, tool } = await readMutableRegistryTool(home, toolId);

  tool.toolPath = toolPath;

  await writeJsonFile(home.registry, registry);
};

export const setShimMetadataBins = async ({
  home,
  toolId,
  bins,
}: {
  home: TestHome;
  toolId: string;
  bins: unknown;
}): Promise<void> => {
  const { tool } = await readMutableRegistryTool(home, toolId);
  const metadata = await readMutableMetadata(tool.metadataPath);

  await writeJsonFile(tool.metadataPath, { ...metadata, bins });
};

export const setShimMetadataSourcePath = async ({
  home,
  toolId,
  binName,
  sourcePath,
}: {
  home: TestHome;
  toolId: string;
  binName: string;
  sourcePath: string;
}): Promise<void> => {
  const { tool } = await readMutableRegistryTool(home, toolId);
  const metadata = await readMutableMetadata(tool.metadataPath);
  const binMetadata = expectMutableBinMetadata(metadata, binName);

  metadata.bins[binName] = { ...binMetadata, source: sourcePath };

  await writeJsonFile(tool.metadataPath, metadata);
};
