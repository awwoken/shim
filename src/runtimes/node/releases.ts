import type { NodeRuntimeConfig } from "@/core/config";
import type { NodeRelease } from "@/runtimes/node/types";
import { AppError } from "@/support/errors";
import * as semver from "semver";

export const releaseVersion = (release: NodeRelease): string =>
  release.version.replace(/^v/, "");

const parseNodeReleases = (value: unknown): NodeRelease[] => {
  if (!Array.isArray(value)) {
    throw new AppError("Invalid Node.js release metadata");
  }

  return value
    .filter((item): item is NodeRelease => {
      if (item === null || item === undefined || typeof item !== "object") {
        return false;
      }

      const release = item as { version?: unknown; lts?: unknown };

      return (
        typeof release.version === "string" &&
        (typeof release.lts === "string" || release.lts === false)
      );
    })
    .sort((left, right) =>
      semver.rcompare(releaseVersion(left), releaseVersion(right)),
    );
};

export const fetchNodeReleases = async (
  config: NodeRuntimeConfig,
): Promise<NodeRelease[]> => {
  const response = await fetch(`${config.mirror}/index.json`);

  if (!response.ok) {
    throw new AppError(
      `Failed to fetch Node.js releases with status ${response.status}`,
    );
  }

  return parseNodeReleases(await response.json());
};

export const selectLatestLts = (releases: NodeRelease[]): string => {
  const release = releases.find((candidate) => candidate.lts !== false);

  if (release === undefined) {
    throw new AppError("No Node.js LTS release was found");
  }

  return releaseVersion(release);
};

const selectOverrideVersion = (
  releases: NodeRelease[],
  override: string,
): string => {
  if (override === "lts") {
    return selectLatestLts(releases);
  }

  if (/^\d+$/.test(override)) {
    const major = Number(override);
    const release = releases.find(
      (candidate) => semver.major(releaseVersion(candidate)) === major,
    );

    if (release === undefined) {
      throw new AppError(`No Node.js ${override}.x release was found`);
    }

    return releaseVersion(release);
  }

  const normalized = semver.valid(override);

  if (normalized === null) {
    throw new AppError(`Invalid Node.js version override ${override}`);
  }

  const release = releases.find(
    (candidate) => releaseVersion(candidate) === normalized,
  );

  if (release === undefined) {
    throw new AppError(`Node.js ${normalized} was not found in release index`);
  }

  return normalized;
};

export const selectNodeVersion = (
  releases: NodeRelease[],
  enginesNode: string | undefined,
  override: string | undefined,
): string => {
  if (override !== undefined) {
    return selectOverrideVersion(releases, override);
  }

  if (enginesNode === undefined || enginesNode === "") {
    return selectLatestLts(releases);
  }

  const ltsRelease = releases.find(
    (release) =>
      release.lts !== false &&
      semver.satisfies(releaseVersion(release), enginesNode),
  );

  if (ltsRelease !== undefined) {
    return releaseVersion(ltsRelease);
  }

  const newestRelease = releases.find((release) =>
    semver.satisfies(releaseVersion(release), enginesNode),
  );

  if (newestRelease === undefined) {
    throw new AppError(
      `Package requires node ${enginesNode}, but no supported Node version was found`,
    );
  }

  return releaseVersion(newestRelease);
};
