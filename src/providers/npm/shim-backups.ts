import { randomUUID } from "node:crypto";
import { chmod, readFile, rename, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import { AppError } from "@/support/errors";
import { ensureDir, pathExists, removePath } from "@/support/fs";
import type { ShimPaths } from "@/support/paths";

type ShimBackup = {
  path: string;
  content?: Buffer;
  mode?: number;
};

const uniqueBins = (left: string[], right: string[]): string[] =>
  [...new Set([...left, ...right])].toSorted();

const backupShim = async (path: string): Promise<ShimBackup> => {
  if (!(await pathExists(path))) {
    return { path };
  }

  const [content, stats] = await Promise.all([readFile(path), stat(path)]);

  return { path, content, mode: stats.mode };
};

const restoreShim = async ({
  path,
  content,
  mode,
}: ShimBackup): Promise<void> => {
  if (content === undefined) {
    await removePath(path);

    return;
  }

  await ensureDir(dirname(path));
  await writeFile(path, content);

  if (mode !== undefined) {
    await chmod(path, mode);
  }
};

type NpmToolPathBackup = {
  backupPath?: string;
  finalToolPath: string;
};

type BackupExistingNpmToolPathInput = {
  finalToolPath: string;
  force: boolean;
  packageRoot: string;
  packageName: string;
  packageVersion: string;
};

export const backupExistingNpmToolPath = async ({
  finalToolPath,
  force,
  packageRoot,
  packageName,
  packageVersion,
}: BackupExistingNpmToolPathInput): Promise<NpmToolPathBackup> => {
  if (!(await pathExists(finalToolPath))) {
    return { finalToolPath };
  }

  if (!force) {
    throw new AppError(`${packageName}@${packageVersion} is already installed`);
  }

  const backupPath = join(packageRoot, `.replacement-${randomUUID()}`);
  await ensureDir(packageRoot);
  await rename(finalToolPath, backupPath);

  return { finalToolPath, backupPath };
};

export const removeNpmToolPathBackup = async ({
  backupPath,
}: NpmToolPathBackup): Promise<void> => {
  if (backupPath !== undefined) {
    await removePath(backupPath);
  }
};

export const restoreNpmToolPathBackup = async ({
  backupPath,
  finalToolPath,
}: NpmToolPathBackup): Promise<void> => {
  if (backupPath === undefined) {
    return;
  }

  await removePath(finalToolPath);
  await rename(backupPath, finalToolPath);
};

type BackupNpmShimsInput = {
  paths: ShimPaths;
  nextBins: string[];
  previousBins: string[];
};

export const backupNpmShims = async ({
  paths,
  nextBins,
  previousBins,
}: BackupNpmShimsInput): Promise<ShimBackup[]> =>
  await Promise.all(
    uniqueBins(nextBins, previousBins).map(
      async (binName) => await backupShim(join(paths.bin, binName)),
    ),
  );

export const restoreNpmShims = async (backups: ShimBackup[]): Promise<void> => {
  for (const backup of backups) {
    await restoreShim(backup);
  }
};
