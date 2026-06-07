import { partialShimConfigSchema } from "@/core/config/schema";
import { NODE_RUNTIME_ID, NPM_PROVIDER_ID } from "@/core/ids";
import { readJsonFile } from "@/support/fs";
import type { ShimPaths } from "@/support/paths";
import { parseJsonSchema } from "@/support/validation";

export type NodeRuntimeConfig = {
  defaultPolicy: "latest-lts";
  bootstrapVersion?: string;
  mirror: string;
};

export type NpmProviderConfig = {
  registry: string;
};

export type ShimConfig = {
  providers: {
    [NPM_PROVIDER_ID]: NpmProviderConfig;
  };
  runtimes: {
    [NODE_RUNTIME_ID]: NodeRuntimeConfig;
  };
};

export const defaultConfig = (): ShimConfig => ({
  providers: {
    [NPM_PROVIDER_ID]: {
      registry: "https://registry.npmjs.org",
    },
  },
  runtimes: {
    [NODE_RUNTIME_ID]: {
      defaultPolicy: "latest-lts",
      mirror: "https://nodejs.org/dist",
    },
  },
});

export const loadConfig = async (paths: ShimPaths): Promise<ShimConfig> => {
  const configJson = await readJsonFile<unknown>(paths.config);
  const defaults = defaultConfig();

  if (configJson === undefined) {
    return defaults;
  }

  const config = parseJsonSchema({
    schema: partialShimConfigSchema,
    value: configJson,
    label: "config file",
    path: paths.config,
  });
  const npmConfig = config.providers?.[NPM_PROVIDER_ID];
  const nodeConfig = config.runtimes?.[NODE_RUNTIME_ID];

  return {
    providers: {
      [NPM_PROVIDER_ID]: {
        registry:
          npmConfig?.registry ??
          config.registry ??
          defaults.providers[NPM_PROVIDER_ID].registry,
      },
    },
    runtimes: {
      [NODE_RUNTIME_ID]: {
        defaultPolicy:
          nodeConfig?.defaultPolicy ??
          config.defaultNodePolicy ??
          defaults.runtimes[NODE_RUNTIME_ID].defaultPolicy,
        bootstrapVersion: nodeConfig?.bootstrapVersion ?? config.bootstrapNode,
        mirror:
          nodeConfig?.mirror ??
          config.nodeMirror ??
          defaults.runtimes[NODE_RUNTIME_ID].mirror,
      },
    },
  };
};
