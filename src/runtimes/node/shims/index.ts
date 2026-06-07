import { lstat, readFile, realpath, readlink } from "node:fs/promises";
import { dirname, extname, isAbsolute, join, resolve } from "node:path";

import type { BinMetadata } from "@/core/models";
import {
  NODE_DIRECT_SHIM_KIND,
  NODE_PATH_FALLBACK_SHIM_KIND,
  SHELL_WRAPPER_ENTRY_MATCH_INDEX,
} from "@/runtimes/node/shims/constants";
import { ensureDir, ensureExecutable, writeFileAtomic } from "@/support/fs";
import { isExpectedFsProbeError } from "@/support/fs/errors";

const shellQuote = (value: string): string =>
  `'${value.replaceAll("'", "'\\''")}'`;

const directNodeShim = (nodePath: string, entryPath: string): string =>
  `#!/bin/sh\nexec ${shellQuote(nodePath)} ${shellQuote(entryPath)} "$@"\n`;

const pathFallbackShim = (sourceBinPath: string, nodeBinDir: string): string =>
  [
    "#!/bin/sh",
    `export PATH=${shellQuote(nodeBinDir)}":$PATH"`,
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

const resolveNodeEntry = async (
  sourceBinPath: string,
): Promise<string | null> => {
  const resolvedPath = await resolveSymlink(sourceBinPath);

  if (extname(resolvedPath) === ".js") {
    return resolvedPath;
  }

  const content = await readSmallTextFile(resolvedPath);

  if (content === null) {
    return null;
  }

  const [firstLine = ""] = content.split("\n");

  if (firstLine.includes("node")) {
    return resolvedPath;
  }

  return resolveShellWrappedNodeEntry(resolvedPath, content);
};

export const createNodeExecutableShim = async (
  shimPath: string,
  sourceBinPath: string,
  nodePath: string,
): Promise<BinMetadata> => {
  const entry = await resolveNodeEntry(sourceBinPath);
  const content =
    entry === null
      ? pathFallbackShim(sourceBinPath, dirname(nodePath))
      : directNodeShim(nodePath, entry);

  await ensureDir(dirname(shimPath));
  await writeFileAtomic(shimPath, content);
  await ensureExecutable(shimPath);

  return {
    source: sourceBinPath,
    type: entry === null ? NODE_PATH_FALLBACK_SHIM_KIND : NODE_DIRECT_SHIM_KIND,
    target: entry ?? sourceBinPath,
  };
};
