import { expect } from "bun:test";

import { readJsonFile } from "../filesystem/test-home";

type RegistryTool = {
  packageVersion: string;
  toolPath: string;
  runtime: { version: string };
  installPolicy?: {
    ignoreScripts?: boolean;
    runtimeOverride?: string;
  };
};

type RegistryBin = {
  toolId: string;
};

type Registry = {
  tools: Record<string, Partial<RegistryTool>>;
  bins: Record<string, Partial<RegistryBin>>;
};

export const readRegistry = async (path: string): Promise<Registry> =>
  await readJsonFile<Registry>(path);

export const expectToolInstalled = async (
  registryPath: string,
  toolId: string,
): Promise<void> => {
  const registry = await readRegistry(registryPath);

  expect(registry.tools[toolId]).toBeDefined();
};

export const expectToolMissing = async (
  registryPath: string,
  toolId: string,
): Promise<void> => {
  const registry = await readRegistry(registryPath);

  expect(registry.tools[toolId]).toBeUndefined();
};

export const expectToolVersion = async (
  registryPath: string,
  toolId: string,
  version: string,
): Promise<void> => {
  const registry = await readRegistry(registryPath);

  expect(registry.tools[toolId]?.packageVersion).toBe(version);
};

export const expectToolRuntime = async (
  registryPath: string,
  toolId: string,
  version: string,
): Promise<void> => {
  const registry = await readRegistry(registryPath);

  expect(registry.tools[toolId]?.runtime?.version).toBe(version);
};

export const expectToolRuntimeOverride = async (
  registryPath: string,
  toolId: string,
  version: string,
): Promise<void> => {
  const registry = await readRegistry(registryPath);

  expect(registry.tools[toolId]?.installPolicy?.runtimeOverride).toBe(version);
};

export const expectToolIgnoreScripts = async (
  registryPath: string,
  toolId: string,
  ignoreScripts: boolean,
): Promise<void> => {
  const registry = await readRegistry(registryPath);

  expect(registry.tools[toolId]?.installPolicy?.ignoreScripts).toBe(
    ignoreScripts,
  );
};

export const expectBinOwner = async (
  registryPath: string,
  bin: string,
  toolId: string,
): Promise<void> => {
  const registry = await readRegistry(registryPath);

  expect(registry.bins[bin]?.toolId).toBe(toolId);
};

export const registryToolPath = async (
  registryPath: string,
  toolId: string,
): Promise<string | undefined> => {
  const registry = await readRegistry(registryPath);

  return registry.tools[toolId]?.toolPath;
};

export const expectRegistryToolPath = async (
  registryPath: string,
  toolId: string,
): Promise<string> => {
  const toolPath = await registryToolPath(registryPath, toolId);

  expect(toolPath).toBeDefined();

  if (toolPath === undefined) {
    throw new Error(`Expected registry tool path for ${toolId}`);
  }

  return toolPath;
};
