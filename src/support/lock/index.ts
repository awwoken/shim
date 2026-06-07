import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";

import { AppError } from "@/support/errors";
import { ensureDir, writeJsonAtomic } from "@/support/fs";
import type { ShimPaths } from "@/support/paths";

export type LockHandle = {
  release: () => Promise<void>;
};

export const acquireMutationLock = async (
  paths: ShimPaths,
): Promise<LockHandle> => {
  await ensureDir(paths.locks);

  const lockPath = join(paths.locks, "mutation.lock");

  try {
    await mkdir(lockPath);
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "EEXIST") {
      throw new AppError(
        "another shim command is already modifying state",
        `remove ${lockPath} only if no shim process is running`,
      );
    }

    throw error;
  }

  await writeJsonAtomic(join(lockPath, "owner.json"), {
    pid: process.pid,
    createdAt: new Date().toISOString(),
  });

  return {
    release: async (): Promise<void> => {
      await rm(lockPath, { force: true, recursive: true });
    },
  };
};

export const withMutationLock = async <T>(
  paths: ShimPaths,
  action: () => Promise<T>,
): Promise<T> => {
  const lock = await acquireMutationLock(paths);

  try {
    return await action();
  } finally {
    await lock.release();
  }
};
