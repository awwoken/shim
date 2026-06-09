import { chmod, mkdir } from "node:fs/promises";

import type { TestHome } from "./test-home";

const READONLY_DIRECTORY_MODE = 0o555;
const WRITABLE_DIRECTORY_MODE = 0o755;

export const makeRegistryWritesFail = async (home: TestHome): Promise<void> => {
  await mkdir(home.bin, { recursive: true });
  await mkdir(home.cache, { recursive: true });
  await mkdir(home.locks, { recursive: true });
  await mkdir(home.runtimes, { recursive: true });
  await mkdir(home.tmp, { recursive: true });
  await mkdir(home.tools, { recursive: true });
  await chmod(home.root, READONLY_DIRECTORY_MODE);
};

export const restoreHomeWrites = async (home: TestHome): Promise<void> => {
  await chmod(home.root, WRITABLE_DIRECTORY_MODE);
};

export const restoreHomeWritesIfPresent = async (
  home: TestHome,
): Promise<void> => {
  await restoreHomeWrites(home).catch((caughtError) => {
    if (caughtError instanceof Error && "code" in caughtError) {
      return;
    }

    throw caughtError;
  });
};
