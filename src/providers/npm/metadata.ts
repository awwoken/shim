import type { ShimConfig } from "@/core/config";
import { silentReporter, type Reporter } from "@/core/reporter";
import { ensureBootstrapNode, nodeBinPath, npmBinPath } from "@/runtimes/node";
import { NODE_RUNTIME_ID } from "@/runtimes/node/constants";
import { AppError } from "@/support/errors";
import type { ShimPaths } from "@/support/paths";
import { runCommand } from "@/support/process";
import * as semver from "semver";

import {
  NPM_PROVIDER_ID,
  SORT_EQUAL,
  SORT_LEFT_AFTER,
  SORT_LEFT_BEFORE,
} from "./constants";

export type NpmPackageMetadata = {
  name: string;
  version: string;
  enginesNode?: string;
};

type NpmViewResult = {
  name?: unknown;
  version?: unknown;
  engines?: unknown;
};

const readVersion = (value: unknown): string | undefined => {
  if (value === null || value === undefined || typeof value !== "object") {
    return undefined;
  }

  const candidate = value as { version?: unknown };

  return typeof candidate.version === "string" ? candidate.version : undefined;
};

const readEnginesNode = (engines: unknown): string | undefined => {
  if (
    engines === null ||
    engines === undefined ||
    typeof engines !== "object"
  ) {
    return undefined;
  }

  const candidate = engines as { node?: unknown };

  return typeof candidate.node === "string" ? candidate.node : undefined;
};

const selectNewestNpmViewResult = (items: unknown[]): unknown =>
  items
    .toSorted((left, right) => {
      const leftVersion = readVersion(left);
      const rightVersion = readVersion(right);

      if (leftVersion === undefined && rightVersion === undefined) {
        return SORT_EQUAL;
      }

      if (leftVersion === undefined) {
        return SORT_LEFT_AFTER;
      }

      if (rightVersion === undefined) {
        return SORT_LEFT_BEFORE;
      }

      return semver.rcompare(leftVersion, rightVersion);
    })
    .shift();

const parseNpmView = (
  stdout: string,
  packageSpec: string,
): NpmPackageMetadata => {
  const parsed = JSON.parse(stdout) as unknown;
  const selected = Array.isArray(parsed)
    ? selectNewestNpmViewResult(parsed)
    : parsed;

  if (
    selected === null ||
    selected === undefined ||
    typeof selected !== "object"
  ) {
    throw new AppError(`Npm returned invalid metadata for ${packageSpec}`);
  }

  const metadata = selected as NpmViewResult;

  if (typeof metadata.name !== "string") {
    throw new AppError(
      `Npm metadata for ${packageSpec} did not include a name`,
    );
  }

  if (typeof metadata.version !== "string") {
    throw new AppError(
      `Npm metadata for ${packageSpec} did not include a version`,
    );
  }

  return {
    name: metadata.name,
    version: metadata.version,
    enginesNode: readEnginesNode(metadata.engines),
  };
};

type ResolveNpmPackageInput = {
  paths: ShimPaths;
  config: ShimConfig;
  packageSpec: string;
  reporter?: Reporter;
};

export const resolveNpmPackage = async ({
  paths,
  config,
  packageSpec,
  reporter = silentReporter,
}: ResolveNpmPackageInput): Promise<NpmPackageMetadata> => {
  const nodeConfig = config.runtimes[NODE_RUNTIME_ID];
  const npmConfig = config.providers[NPM_PROVIDER_ID];
  const bootstrapNode = await ensureBootstrapNode(paths, nodeConfig, reporter);
  const nodePath = nodeBinPath(paths, bootstrapNode);
  const npmPath = npmBinPath(paths, bootstrapNode);
  const { registry } = npmConfig;

  reporter.info(`Using bootstrap node ${bootstrapNode} at ${nodePath}`);
  reporter.info(`Resolving ${packageSpec} from ${registry}`);

  try {
    const { stdout } = await runCommand(npmPath, [
      "view",
      packageSpec,
      "--json",
      "--registry",
      registry,
    ]);
    const metadata = parseNpmView(stdout, packageSpec);

    reporter.info(`Found ${metadata.name}@${metadata.version}`);

    return metadata;
  } catch (error) {
    reporter.info(`Failed to resolve ${packageSpec}`);

    throw error;
  }
};
