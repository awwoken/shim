import { chmod, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import type { TestHome } from "./test-home";

const EXECUTABLE_FILE_MODE = 0o755;
const EXIT_SUCCESS = 0;
const EXIT_FAILURE = 1;

type CommandLookupResult = {
  stdout: string;
  exitCode: number;
};

const commandLookup = async (command: string): Promise<CommandLookupResult> => {
  const child = Bun.spawn(["sh", "-c", `command -v ${command}`], {
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, exitCode] = await Promise.all([
    new Response(child.stdout).text(),
    child.exited,
  ]);

  return { stdout, exitCode };
};

export const findHostCommand = async (command: string): Promise<string> => {
  const result = await commandLookup(command);

  if (result.exitCode !== EXIT_SUCCESS) {
    throw new Error(`Could not find host ${command} for int tests`);
  }

  return result.stdout.trim();
};

export const nodeWrapperSource = (hostNode: string): string =>
  `#!/bin/sh\nexec ${JSON.stringify(hostNode)} "$@"\n`;

export const findHostNpmCli = async (): Promise<string> => {
  const child = Bun.spawn(["npm", "root", "-g"], {
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);

  if (exitCode !== EXIT_SUCCESS) {
    throw new Error(`Could not find host npm CLI: ${stderr}`);
  }

  return `${stdout.trim()}/npm/bin/npm-cli.js`;
};

export const npmWrapperSource = (
  hostNode: string,
  hostNpmCli: string,
): string => `
import { spawnSync } from "node:child_process";

const result = spawnSync(${JSON.stringify(hostNode)}, [${JSON.stringify(hostNpmCli)}, ...process.argv.slice(2)], {
  env: process.env,
  stdio: "inherit",
});

if (result.error !== undefined) {
  throw result.error;
}

process.exit(result.status ?? ${EXIT_FAILURE});
`;

export const preseedManagedRuntime = async (
  home: TestHome,
  version: string,
): Promise<void> => {
  const [hostNode, hostNpmCli] = await Promise.all([
    findHostCommand("node"),
    findHostNpmCli(),
  ]);
  const runtimeBin = join(home.runtimes, "node", version, "bin");
  const nodePath = join(runtimeBin, "node");
  const npmPath = join(runtimeBin, "npm");

  await mkdir(runtimeBin, { recursive: true });
  await writeFile(nodePath, nodeWrapperSource(hostNode));
  await writeFile(npmPath, npmWrapperSource(hostNode, hostNpmCli));
  await chmod(nodePath, EXECUTABLE_FILE_MODE);
  await chmod(npmPath, EXECUTABLE_FILE_MODE);
};
