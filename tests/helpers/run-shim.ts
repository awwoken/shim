import { resolve } from "node:path";

const PROJECT_ROOT = resolve(import.meta.dir, "../..");
const [BUN_EXECUTABLE = "bun"] = Bun.argv;
const EXIT_SUCCESS = 0;

export type RunShimResult = {
  exitCode: number;
  stdout: string;
  stderr: string;
};

type RunShimInput = {
  home: string;
  args: string[];
  env?: Record<string, string>;
};

type RunShimShellInput = RunShimInput & {
  shellPrelude: string;
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

const createShimEnvironment = (
  home: string,
  env: Record<string, string>,
): Record<string, string> => ({
  ...copyCurrentEnvironment(),
  ...env,
  SHIM_HOME: home,
  NO_COLOR: "1",
  FORCE_COLOR: "0",
});

type PipedSubprocess = {
  stdout: ReadableStream<Uint8Array>;
  stderr: ReadableStream<Uint8Array>;
  exited: Promise<number>;
};

const collectResult = async (
  child: PipedSubprocess,
): Promise<RunShimResult> => {
  const [stdout, stderr, exitCode] = await Promise.all([
    child.stdout.text(),
    child.stderr.text(),
    child.exited,
  ]);

  return { exitCode, stdout, stderr };
};

export const runShim = async ({
  home,
  args,
  env = {},
}: RunShimInput): Promise<RunShimResult> => {
  const child = Bun.spawn([BUN_EXECUTABLE, "src/index.ts", ...args], {
    cwd: PROJECT_ROOT,
    env: createShimEnvironment(home, env),
    stdout: "pipe",
    stderr: "pipe",
  });

  return await collectResult(child);
};

export const runShimWithShellPrelude = async ({
  home,
  args,
  env = {},
  shellPrelude,
}: RunShimShellInput): Promise<RunShimResult> => {
  const child = Bun.spawn(
    [
      "sh",
      "-c",
      `${shellPrelude}; exec "$1" src/index.ts "$@"`,
      "shim-test",
      BUN_EXECUTABLE,
      ...args,
    ],
    {
      cwd: PROJECT_ROOT,
      env: createShimEnvironment(home, env),
      stdout: "pipe",
      stderr: "pipe",
    },
  );

  return await collectResult(child);
};

export const expectSuccess = (result: RunShimResult): void => {
  if (result.exitCode === EXIT_SUCCESS) {
    return;
  }

  throw new Error(
    `Expected shim command to succeed.\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
  );
};

export const expectFailure = (result: RunShimResult): void => {
  if (result.exitCode !== EXIT_SUCCESS) {
    return;
  }

  throw new Error(
    `Expected shim command to fail.\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
  );
};
