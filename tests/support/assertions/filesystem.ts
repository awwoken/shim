import { expect } from "bun:test";
import { access } from "node:fs/promises";

export const pathExists = async (path: string): Promise<boolean> => {
  try {
    await access(path);

    return true;
  } catch (caughtError) {
    if (caughtError instanceof Error && "code" in caughtError) {
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
