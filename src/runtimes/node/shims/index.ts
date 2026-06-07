import { lstat, readFile, realpath, readlink } from "node:fs/promises";
import { dirname, extname, isAbsolute, join, resolve } from "node:path";

import type { BinMetadata } from "@/core/models";
import {
  NODE_DIRECT_SHIM_KIND,
  NODE_PATH_FALLBACK_SHIM_KIND,
  SHEBANG_COMMAND_MATCH_INDEX,
  SHELL_WRAPPER_ENTRY_MATCH_INDEX,
} from "@/runtimes/node/shims/constants";
import { ensureDir, ensureExecutable, writeFileAtomic } from "@/support/fs";
import { isExpectedFsProbeError } from "@/support/fs/errors";

const shellQuote = (value: string): string =>
  `'${value.replaceAll("'", "'\\''")}'`;

const managedNodePathExport = (nodeBinDir: string): string =>
  `export PATH=${shellQuote(nodeBinDir)}":$PATH"`;

const directNodeShim = (
  nodePath: string,
  entryPath: string,
  nodeBinDir: string,
): string =>
  [
    "#!/bin/sh",
    managedNodePathExport(nodeBinDir),
    `exec ${shellQuote(nodePath)} ${shellQuote(entryPath)} "$@"`,
    "",
  ].join("\n");

const pathFallbackShim = (sourceBinPath: string, nodeBinDir: string): string =>
  [
    "#!/bin/sh",
    managedNodePathExport(nodeBinDir),
    `exec ${shellQuote(sourceBinPath)} "$@"`,
    "",
  ].join("\n");

const resolveSymlink = async (path: string): Promise<string> => {
  const stats = await lstat(path);

  if (!stats.isSymbolicLink()) {
    return path;
  }

  const link = await readlink(path);
  const target = isAbsolute(link) ? link : resolve(dirname(path), link);

  return await realpath(target);
};

const readSmallTextFile = async (path: string): Promise<string | null> => {
  try {
    return await readFile(path, "utf8");
  } catch (caughtError) {
    if (isExpectedFsProbeError(caughtError)) {
      return null;
    }

    throw caughtError;
  }
};

const resolveShellWrappedNodeEntry = (
  wrapperPath: string,
  content: string,
): string | null => {
  const match = content.match(/\$basedir\/([^"\s]+\.js)/);
  const entry = match?.[SHELL_WRAPPER_ENTRY_MATCH_INDEX];

  if (entry === undefined) {
    return null;
  }

  return join(dirname(wrapperPath), entry);
};

const readFirstLine = async (path: string): Promise<string | null> => {
  const content = await readSmallTextFile(path);

  if (content === null) {
    return null;
  }

  const [firstLine = ""] = content.split("\n");

  return firstLine;
};

const shebangUsesNode = (firstLine: string): boolean => {
  if (!firstLine.startsWith("#!")) {
    return false;
  }

  return firstLine.includes("node");
};

const shebangHasNodeOptions = (firstLine: string): boolean => {
  const command =
    firstLine.match(/^#!\S+\s+(.*)$/u)?.[SHEBANG_COMMAND_MATCH_INDEX];

  if (command === undefined) {
    return false;
  }

  const normalizedCommand = command.startsWith("-S ")
    ? command.slice("-S ".length)
    : command;

  return normalizedCommand
    .trim()
    .split(/\s+/u)
    .some((part) => part.startsWith("-"));
};

const canUseDirectNodeShim = async (entryPath: string): Promise<boolean> => {
  const firstLine = await readFirstLine(entryPath);

  return firstLine === null || !shebangHasNodeOptions(firstLine);
};

const resolveNodeEntry = async (
  sourceBinPath: string,
): Promise<string | null> => {
  const resolvedPath = await resolveSymlink(sourceBinPath);
  const content = await readSmallTextFile(resolvedPath);

  if (content === null) {
    return extname(resolvedPath) === ".js" ? resolvedPath : null;
  }

  const [firstLine = ""] = content.split("\n");

  if (shebangUsesNode(firstLine)) {
    return shebangHasNodeOptions(firstLine) ? null : resolvedPath;
  }

  const shellWrappedEntry = resolveShellWrappedNodeEntry(resolvedPath, content);

  if (shellWrappedEntry === null) {
    return null;
  }

  return (await canUseDirectNodeShim(shellWrappedEntry))
    ? shellWrappedEntry
    : null;
};

export const createNodeExecutableShim = async (
  shimPath: string,
  sourceBinPath: string,
  nodePath: string,
): Promise<BinMetadata> => {
  const entry = await resolveNodeEntry(sourceBinPath);
  const nodeBinDir = dirname(nodePath);
  const content =
    entry === null
      ? pathFallbackShim(sourceBinPath, nodeBinDir)
      : directNodeShim(nodePath, entry, nodeBinDir);

  await ensureDir(dirname(shimPath));
  await writeFileAtomic(shimPath, content);
  await ensureExecutable(shimPath);

  return {
    source: sourceBinPath,
    type: entry === null ? NODE_PATH_FALLBACK_SHIM_KIND : NODE_DIRECT_SHIM_KIND,
    target: entry ?? sourceBinPath,
  };
};
