import { homedir } from "node:os";
import { join, resolve } from "node:path";

import type { ProviderId } from "@/core/models";

export type ShimPaths = {
  home: string;
  bin: string;
  cache: string;
  config: string;
  locks: string;
  registry: string;
  runtimes: string;
  tmp: string;
  tools: string;
};

export const getShimHome = (): string => {
  const configuredHome = Bun.env["SHIM_HOME"];

  if (configuredHome === undefined || configuredHome === "") {
    return join(homedir(), ".shim");
  }

  return resolve(configuredHome);
};

export const getShimPaths = (home = getShimHome()): ShimPaths => ({
  home,
  bin: join(home, "bin"),
  cache: join(home, "cache"),
  config: join(home, "config.json"),
  locks: join(home, "locks"),
  registry: join(home, "registry.json"),
  runtimes: join(home, "runtimes"),
  tmp: join(home, "tmp"),
  tools: join(home, "tools"),
});

export const providerToolRoot = (
  paths: ShimPaths,
  provider: ProviderId,
): string => join(paths.tools, provider);
