import { removeNpmTool, upgradeNpmTools } from "@/providers/npm/actions";
import { NPM_PROVIDER_ID } from "@/providers/npm/constants";
import { installNpmPackage } from "@/providers/npm/install";
import type { ToolProvider } from "@/providers/types";

export const npmProvider: ToolProvider = {
  id: NPM_PROVIDER_ID,
  install: installNpmPackage,
  remove: async ({ paths, packageOrBin, reporter }) =>
    await removeNpmTool(paths, packageOrBin, reporter),
  upgrade: async ({ paths, config, packageOrBin, reporter }) =>
    await upgradeNpmTools({ paths, config, packageOrBin, reporter }),
};
