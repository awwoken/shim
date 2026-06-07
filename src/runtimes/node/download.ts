import { randomUUID } from "node:crypto";
import { readdir, rename } from "node:fs/promises";
import { dirname, join } from "node:path";

import type { NodeRuntimeConfig } from "@/core/config";
import { silentReporter, type Reporter } from "@/core/reporter";
import { EXPECTED_NODE_ARCHIVE_ROOT_DIRECTORIES } from "@/runtimes/node/constants";
import { nodeArchiveName, nodePlatformSlug } from "@/runtimes/node/platform";
import { AppError } from "@/support/errors";
import {
  assertDirectory,
  ensureDir,
  pathExists,
  removePath,
  sha256File,
} from "@/support/fs";
import type { ShimPaths } from "@/support/paths";
import { runCommand } from "@/support/process";

type DownloadNodeRuntimeOptions = {
  paths: ShimPaths;
  config: NodeRuntimeConfig;
  version: string;
  runtimePath: string;
  reporter?: Reporter;
};

const downloadFile = async (
  url: string,
  path: string,
  reporter: Reporter,
): Promise<void> => {
  if (await pathExists(path)) {
    reporter.info(`Using cached node archive ${path}`);

    return;
  }

  reporter.info(`Downloading ${url} to ${path}`);
  const response = await fetch(url);

  if (!response.ok) {
    throw new AppError(
      `Failed to download ${url} with status ${response.status}`,
    );
  }

  await Bun.write(path, await response.arrayBuffer());
};

const parseShaSums = (content: string, archiveName: string): string => {
  for (const line of content.split("\n")) {
    const [hash, fileName] = line.trim().split(/\s+/);

    if (fileName === archiveName && hash !== undefined) {
      return hash;
    }
  }

  throw new AppError(`SHA256 entry not found for ${archiveName}`);
};

const verifyNodeArchive = async (
  archivePath: string,
  archiveName: string,
  sumsUrl: string,
): Promise<boolean> => {
  const response = await fetch(sumsUrl);

  if (!response.ok) {
    throw new AppError(
      `Failed to download ${sumsUrl} with status ${response.status}`,
    );
  }

  const expected = parseShaSums(await response.text(), archiveName);
  const actual = await sha256File(archivePath);

  return actual === expected;
};

type EnsureVerifiedNodeArchiveOptions = {
  archiveUrl: string;
  cachePath: string;
  archiveName: string;
  sumsUrl: string;
  reporter: Reporter;
};

const ensureVerifiedNodeArchive = async ({
  archiveUrl,
  cachePath,
  archiveName,
  sumsUrl,
  reporter,
}: EnsureVerifiedNodeArchiveOptions): Promise<void> => {
  await downloadFile(archiveUrl, cachePath, reporter);
  reporter.info(`Verifying node archive ${cachePath}`);

  if (await verifyNodeArchive(cachePath, archiveName, sumsUrl)) {
    return;
  }

  reporter.info(
    `Cached node archive failed verification, redownloading ${cachePath}`,
  );
  await removePath(cachePath);
  await downloadFile(archiveUrl, cachePath, reporter);
  reporter.info(`Verifying node archive ${cachePath}`);

  if (!(await verifyNodeArchive(cachePath, archiveName, sumsUrl))) {
    throw new AppError(`SHA256 mismatch for ${archiveName}`);
  }
};

const validateTarEntries = async (
  archivePath: string,
  expectedRoot: string,
): Promise<void> => {
  const { stdout } = await runCommand("tar", ["-tf", archivePath]);

  for (const entry of stdout.split("\n")) {
    if (entry === "") {
      continue;
    }

    if (
      entry.startsWith("/") ||
      entry.includes("../") ||
      !entry.startsWith(`${expectedRoot}/`)
    ) {
      throw new AppError(`Unsafe archive entry ${entry}`);
    }
  }
};

const findExtractedNodeDirectory = async (
  stagePath: string,
): Promise<string> => {
  const entries = await readdir(stagePath);
  const directories: string[] = [];

  for (const entry of entries) {
    const candidate = join(stagePath, entry);

    if (await assertDirectory(candidate)) {
      directories.push(candidate);
    }
  }

  if (directories.length !== EXPECTED_NODE_ARCHIVE_ROOT_DIRECTORIES) {
    throw new AppError("Node.js archive did not contain exactly one directory");
  }

  const [directory] = directories;

  if (directory === undefined) {
    throw new AppError("Node.js archive did not contain a directory");
  }

  return directory;
};

export const downloadNodeRuntime = async ({
  paths,
  config,
  version,
  runtimePath,
  reporter = silentReporter,
}: DownloadNodeRuntimeOptions): Promise<void> => {
  const archive = nodeArchiveName(version);
  const versionTag = `v${version}`;
  const archiveUrl = `${config.mirror}/${versionTag}/${archive}`;
  const sumsUrl = `${config.mirror}/${versionTag}/SHASUMS256.txt`;
  const cachePath = join(paths.cache, "node", archive);
  const stagePath = join(paths.tmp, `node-${version}-${randomUUID()}`);

  await ensureDir(join(paths.cache, "node"));
  await ensureDir(stagePath);

  try {
    await ensureVerifiedNodeArchive({
      archiveUrl,
      cachePath,
      archiveName: archive,
      sumsUrl,
      reporter,
    });
    await validateTarEntries(
      cachePath,
      `node-v${version}-${nodePlatformSlug()}`,
    );
    reporter.info(`Extracting node archive to ${stagePath}`);
    await runCommand("tar", ["-xf", cachePath, "-C", stagePath]);

    const extractedPath = await findExtractedNodeDirectory(stagePath);

    if (await pathExists(runtimePath)) {
      return;
    }

    await ensureDir(dirname(runtimePath));
    await rename(extractedPath, runtimePath);
  } finally {
    await removePath(stagePath);
  }
};
