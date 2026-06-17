import { randomUUID } from "node:crypto";
import { isAbsolute, join, relative, resolve } from "node:path";

import { AppError } from "@/support/errors";
import { providerToolRoot, type ShimPaths } from "@/support/paths";
import * as semver from "semver";

import { NPM_PROVIDER_ID } from "./constants";

const INVALID_PACKAGE_NAME_HINT =
  "Use an npm package name without empty or traversal path segments.";
const INVALID_PACKAGE_VERSION_HINT =
  "Use a concrete semver package version such as 1.2.3.";
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

const assertSafePackageVersion = (
  packageName: string,
  version: string,
): void => {
  if (semver.valid(version) !== null) {
    return;
  }

  throw new AppError(
    `Invalid npm package version ${version} for ${packageName}`,
    INVALID_PACKAGE_VERSION_HINT,
  );
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
): string => {
  assertSafePackageVersion(packageName, version);

  const packageRoot = npmPackageRoot(paths, packageName);
  const toolPath = join(packageRoot, version);

  assertPathInsideRoot(packageName, packageRoot, toolPath);

  return toolPath;
};

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

export const npmStagePath = (paths: ShimPaths): string =>
  join(paths.tmp, `npm-${randomUUID()}`);
