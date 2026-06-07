export type ProviderId = string;

export type RuntimeKind = string;

export type RuntimeRef = {
  kind: RuntimeKind;
  version: string;
};

export type ToolId = `${ProviderId}:${string}`;

export type BinMetadata = {
  source: string;
  type: string;
  target?: string;
};

export type ShimMetadata = {
  provider: ProviderId;
  packageName: string;
  packageVersion: string;
  packageSpec: string;
  runtime: RuntimeRef;
  installedAt: string;
  bins: Record<string, BinMetadata>;
  providerData?: Record<string, unknown>;
  runtimeData?: Record<string, unknown>;
};

export type RegistryBin = {
  provider: ProviderId;
  toolId: ToolId;
  packageName: string;
  packageVersion: string;
  shimPath: string;
};

export type RegistryTool = {
  id: ToolId;
  provider: ProviderId;
  packageName: string;
  packageVersion: string;
  packageSpec: string;
  runtime: RuntimeRef;
  installedAt: string;
  toolPath: string;
  metadataPath: string;
  bins: string[];
};

export type Registry = {
  version: number;
  tools: Record<ToolId, RegistryTool>;
  bins: Record<string, RegistryBin>;
};

export type InstallOptions = {
  runtime?: string;
  force: boolean;
  ignoreScripts: boolean;
  replaceToolId?: ToolId;
};
