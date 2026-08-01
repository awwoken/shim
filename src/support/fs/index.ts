import { createHash, randomUUID } from "node:crypto";
import { constants, type Stats } from "node:fs";
import {
  access,
  chmod,
  lstat,
  mkdir,
  rename,
  rm,
  stat,
} from "node:fs/promises";
import { dirname } from "node:path";

import {
  EXECUTABLE_FILE_MODE,
  JSON_INDENT_SPACES,
} from "@/support/fs/constants";
import { isExpectedFsProbeError } from "@/support/fs/errors";

const probePath = async (path: string, mode: number): Promise<boolean> => {
  try {
    await access(path, mode);

    return true;
  } catch (caughtError) {
    if (isExpectedFsProbeError(caughtError)) {
      return false;
    }

    throw caughtError;
  }
};

const probeStats = async (
  path: string,
  predicate: (stats: Stats) => boolean,
): Promise<boolean> => {
  try {
    return predicate(await stat(path));
  } catch (caughtError) {
    if (isExpectedFsProbeError(caughtError)) {
      return false;
    }

    throw caughtError;
  }
};

const probeLinkStats = async (
  path: string,
  predicate: (stats: Stats) => boolean,
): Promise<boolean> => {
  try {
    return predicate(await lstat(path));
  } catch (caughtError) {
    if (isExpectedFsProbeError(caughtError)) {
      return false;
    }

    throw caughtError;
  }
};

export const pathExists = async (path: string): Promise<boolean> =>
  await probePath(path, constants.F_OK);

export const isExecutable = async (path: string): Promise<boolean> =>
  await probePath(path, constants.X_OK);

export const isRegularFile = async (path: string): Promise<boolean> =>
  await probeLinkStats(path, (stats) => stats.isFile());

export const isDirectoryWithoutFollowingSymlinks = async (
  path: string,
): Promise<boolean> =>
  await probeLinkStats(path, (stats) => stats.isDirectory());

export const ensureDir = async (path: string): Promise<void> => {
  await mkdir(path, { recursive: true });
};

export const ensureExecutable = async (path: string): Promise<void> => {
  await chmod(path, EXECUTABLE_FILE_MODE);
};

export const removePath = async (path: string): Promise<void> => {
  await rm(path, { force: true, recursive: true });
};

export const readJsonFile = async <T>(path: string): Promise<T | undefined> => {
  if (!(await pathExists(path))) {
    return undefined;
  }

  return (await Bun.file(path).json()) as T;
};

export const writeFileAtomic = async (
  path: string,
  content: string,
): Promise<void> => {
  await ensureDir(dirname(path));

  const temporaryPath = `${dirname(path)}/.${randomUUID()}.tmp`;
  await Bun.write(temporaryPath, content);
  await rename(temporaryPath, path);
};

export const writeJsonAtomic = async (
  path: string,
  value: unknown,
): Promise<void> => {
  await writeFileAtomic(
    path,
    `${JSON.stringify(value, null, JSON_INDENT_SPACES)}\n`,
  );
};

export const sha256File = async (path: string): Promise<string> => {
  const content = Buffer.from(await Bun.file(path).arrayBuffer());

  return createHash("sha256").update(content).digest("hex");
};

export const assertDirectory = async (path: string): Promise<boolean> =>
  await probeStats(path, (stats) => stats.isDirectory());

export const assertFile = async (path: string): Promise<boolean> =>
  await probeStats(path, (stats) => stats.isFile());
