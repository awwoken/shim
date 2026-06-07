import { join } from "node:path";

import { providerToolRoot, type ShimPaths } from "@/support/paths";

import { NPM_PROVIDER_ID } from "./constants";

export const packagePathSegments = (packageName: string): string[] => {
  if (packageName.startsWith("@")) {
    const [scope, name] = packageName.split("/");

    if (scope === undefined || name === undefined || name === "") {
      return [packageName];
    }

    return [scope, name];
  }

  return [packageName];
};

export const npmPackageRoot = (paths: ShimPaths, packageName: string): string =>
  join(
    providerToolRoot(paths, NPM_PROVIDER_ID),
    ...packagePathSegments(packageName),
  );

export const npmToolPath = (
  paths: ShimPaths,
  packageName: string,
  version: string,
): string => join(npmPackageRoot(paths, packageName), version);

export const npmPrefixPath = (
  paths: ShimPaths,
  packageName: string,
  version: string,
): string => join(npmToolPath(paths, packageName, version), "npm-prefix");

export const npmMetadataPath = (
  paths: ShimPaths,
  packageName: string,
  version: string,
): string => join(npmToolPath(paths, packageName, version), "shim.json");
