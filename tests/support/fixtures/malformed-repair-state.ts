import {
  writeJsonFile,
  type TestHome,
  readJsonFile,
} from "../filesystem/test-home";

type MutableRegistryTool = {
  metadataPath: string;
  bins: string[];
};

type MutableRegistry = {
  tools: Record<string, MutableRegistryTool>;
} & Record<string, unknown>;

type MutableShimMetadata = {
  bins: Record<string, unknown>;
} & Record<string, unknown>;

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
  const registry = await readJsonFile<MutableRegistry>(home.registry);
  const tool = registry.tools[toolId];

  if (tool === undefined) {
    throw new Error(`Expected registry tool ${toolId}`);
  }

  const metadata = await readJsonFile<MutableShimMetadata>(tool.metadataPath);
  const sourceBinMetadata = metadata.bins[sourceBinName];

  if (sourceBinMetadata === undefined) {
    throw new Error(`Expected shim metadata for ${sourceBinName}`);
  }

  tool.bins = [...tool.bins, traversalBinName];
  metadata.bins[traversalBinName] = sourceBinMetadata;

  await writeJsonFile(home.registry, registry);
  await writeJsonFile(tool.metadataPath, metadata);
};
