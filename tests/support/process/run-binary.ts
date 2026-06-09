import { resolve } from "node:path";

import type { RunShimResult } from "./run-shim";

export type RunBinaryResult = RunShimResult;

const PROJECT_ROOT = resolve(import.meta.dir, "../../..");
const BINARY_PATH = resolve(PROJECT_ROOT, "build/shim");
const EXIT_SUCCESS = 0;

type RunBinaryInput = {
  home: string;
  args: string[];
  env?: Record<string, string>;
};

const copyCurrentEnvironment = (): Record<string, string> => {
  const env: Record<string, string> = {};

  for (const [key, value] of Object.entries(Bun.env)) {
    if (value !== undefined) {
      env[key] = value;
    }
  }

  return env;
};

const createBinaryEnvironment = (
  home: string,
  env: Record<string, string>,
): Record<string, string> => ({
  ...copyCurrentEnvironment(),
  ...env,
  SHIM_HOME: home,
  NO_COLOR: "1",
  FORCE_COLOR: "0",
});

export const runBinary = async ({
  home,
  args,
  env = {},
}: RunBinaryInput): Promise<RunShimResult> => {
  const child = Bun.spawn([BINARY_PATH, ...args], {
    cwd: PROJECT_ROOT,
    env: createBinaryEnvironment(home, env),
    stdout: "pipe",
    stderr: "pipe",
  });

  const [stdout, stderr, exitCode] = await Promise.all([
    child.stdout.text(),
    child.stderr.text(),
    child.exited,
  ]);

  return { exitCode, stdout, stderr };
};

export const expectBinarySuccess = (result: RunShimResult): void => {
  if (result.exitCode === EXIT_SUCCESS) {
    return;
  }

  throw new Error(
    `Expected shim binary to succeed.\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
  );
};

export const expectBinaryFailure = (result: RunShimResult): void => {
  if (result.exitCode !== EXIT_SUCCESS) {
    return;
  }

  throw new Error(
    `Expected shim binary to fail.\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
  );
};
