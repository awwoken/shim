import { chmod, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

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
