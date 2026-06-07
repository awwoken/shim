import { isAbsolute, join, relative, resolve } from "node:path";

import { AppError } from "@/support/errors";
import { providerToolRoot, type ShimPaths } from "@/support/paths";

import { NPM_PROVIDER_ID } from "./constants";

const INVALID_PACKAGE_NAME_HINT =
  "Use an npm package name without empty or traversal path segments.";
const SCOPED_PACKAGE_SEGMENT_COUNT = 2;

const isSafePackagePathSegment = (segment: string): boolean =>
  segment !== "" &&
  segment !== "." &&
  segment !== ".." &&
  !segment.includes("/") &&
  !segment.includes("\\") &&
  !segment.includes("\0");

const assertSafePackagePathSegment = (
  packageName: string,
  segment: string,
): void => {
  if (!isSafePackagePathSegment(segment)) {
    throw new AppError(
      `Invalid npm package name ${packageName}`,
      INVALID_PACKAGE_NAME_HINT,
    );
  }
};

const assertPathInsideRoot = (
  packageName: string,
  rootPath: string,
  candidatePath: string,
): void => {
  const relativePath = relative(resolve(rootPath), resolve(candidatePath));

  if (
    relativePath === "" ||
    relativePath.startsWith("..") ||
    isAbsolute(relativePath)
  ) {
    throw new AppError(
      `Invalid npm package path for ${packageName}`,
      INVALID_PACKAGE_NAME_HINT,
    );
  }
};

export const packagePathSegments = (packageName: string): string[] => {
  const segments = packageName.startsWith("@")
    ? packageName.split("/")
    : [packageName];

  if (
    packageName.startsWith("@") &&
    segments.length !== SCOPED_PACKAGE_SEGMENT_COUNT
  ) {
    throw new AppError(
      `Invalid npm package name ${packageName}`,
      INVALID_PACKAGE_NAME_HINT,
    );
  }

  for (const segment of segments) {
    assertSafePackagePathSegment(packageName, segment);
  }

  return segments;
};

export const npmPackageRoot = (
  paths: ShimPaths,
  packageName: string,
): string => {
  const providerRoot = providerToolRoot(paths, NPM_PROVIDER_ID);
  const packageRoot = join(providerRoot, ...packagePathSegments(packageName));

  assertPathInsideRoot(packageName, providerRoot, packageRoot);

  return packageRoot;
};

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
