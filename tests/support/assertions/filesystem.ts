import { expect } from "bun:test";
import { access } from "node:fs/promises";

const isMissingPathError = (error: Error): boolean =>
  "code" in error && (error.code === "ENOENT" || error.code === "ENOTDIR");

export const pathExists = async (path: string): Promise<boolean> => {
  try {
    await access(path);

    return true;
  } catch (caughtError) {
    if (caughtError instanceof Error && isMissingPathError(caughtError)) {
      return false;
    }

    throw caughtError;
  }
};

export const expectPathExists = async (path: string): Promise<void> => {
  expect(await pathExists(path)).toBe(true);
};

export const expectPathMissing = async (path: string): Promise<void> => {
  expect(await pathExists(path)).toBe(false);
};
