import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const JSON_INDENT_SPACES = 2;

export type TestHome = {
  root: string;
  bin: string;
  cache: string;
  config: string;
  locks: string;
  registry: string;
  runtimes: string;
  tmp: string;
  tools: string;
};

export const createTestHome = async (): Promise<TestHome> => {
  const root = await mkdtemp(join(tmpdir(), "shim-test-"));

  return {
    root,
    bin: join(root, "bin"),
    cache: join(root, "cache"),
    config: join(root, "config.json"),
    locks: join(root, "locks"),
    registry: join(root, "registry.json"),
    runtimes: join(root, "runtimes"),
    tmp: join(root, "tmp"),
    tools: join(root, "tools"),
  };
};

export const removeTestHome = async (home: TestHome): Promise<void> => {
  await rm(home.root, { force: true, recursive: true });
};

export const writeJsonFile = async (
  path: string,
  value: unknown,
): Promise<void> => {
  await writeFile(path, `${JSON.stringify(value, null, JSON_INDENT_SPACES)}\n`);
};

export const readJsonFile = async <T>(path: string): Promise<T> => {
  return JSON.parse(await readFile(path, "utf8")) as T;
};
