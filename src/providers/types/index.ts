import type { ShimConfig } from "@/core/config";
import type { InstallOptions, ProviderId, RegistryTool } from "@/core/models";
import type { Reporter } from "@/core/reporter";
import type { ShimPaths } from "@/support/paths";

export type UpgradeResult = {
  packageName: string;
  previousVersion: string;
  nextVersion: string;
  changed: boolean;
};

export type InstallToolInput = {
  paths: ShimPaths;
  config: ShimConfig;
  packageSpec: string;
  options: InstallOptions;
  reporter: Reporter;
};

export type RemoveToolInput = {
  paths: ShimPaths;
  packageOrBin: string;
  reporter: Reporter;
};

export type UpgradeToolsInput = {
  paths: ShimPaths;
  config: ShimConfig;
  packageOrBin: string | undefined;
  reporter: Reporter;
};

export type ToolProvider = {
  id: ProviderId;
  install: (input: InstallToolInput) => Promise<RegistryTool>;
  remove: (input: RemoveToolInput) => Promise<RegistryTool>;
  upgrade: (input: UpgradeToolsInput) => Promise<UpgradeResult[]>;
};
