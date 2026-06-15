import { readdir } from "node:fs/promises";
import { join } from "node:path";

import type { RuntimeRef } from "@/core/models";
import { loadRegistry } from "@/core/registry";
import { pathExists, removePath } from "@/support/fs";
import type { ShimPaths } from "@/support/paths";

const RUNTIME_REF_SEPARATOR = "\0";

export type OrphanedRuntime = RuntimeRef & {
  path: string;
};

const runtimeRefKey = (runtime: RuntimeRef): string =>
  `${runtime.kind}${RUNTIME_REF_SEPARATOR}${runtime.version}`;

const collectReferencedRuntimes = async (
  paths: ShimPaths,
): Promise<Set<string>> => {
  const registry = await loadRegistry(paths);

  return new Set(
    Object.values(registry.tools).map((tool) => runtimeRefKey(tool.runtime)),
  );
};

export const findOrphanedRuntimes = async (
  paths: ShimPaths,
): Promise<OrphanedRuntime[]> => {
  if (!(await pathExists(paths.runtimes))) {
    return [];
  }

  const referencedRuntimes = await collectReferencedRuntimes(paths);
  const orphanedRuntimes: OrphanedRuntime[] = [];

  for (const kindEntry of await readdir(paths.runtimes, {
    withFileTypes: true,
  })) {
    if (!kindEntry.isDirectory()) {
      continue;
    }

    const kind = kindEntry.name;
    const kindPath = join(paths.runtimes, kind);

    for (const versionEntry of await readdir(kindPath, {
      withFileTypes: true,
    })) {
      if (!versionEntry.isDirectory()) {
        continue;
      }

      const runtime = { kind, version: versionEntry.name };

      if (referencedRuntimes.has(runtimeRefKey(runtime))) {
        continue;
      }

      orphanedRuntimes.push({
        ...runtime,
        path: join(kindPath, runtime.version),
      });
    }
  }

  return orphanedRuntimes.toSorted(
    (left, right) =>
      left.kind.localeCompare(right.kind) ||
      left.version.localeCompare(right.version),
  );
};

export const removeOrphanedRuntimes = async (
  paths: ShimPaths,
): Promise<OrphanedRuntime[]> => {
  const orphanedRuntimes = await findOrphanedRuntimes(paths);

  await Promise.all(
    orphanedRuntimes.map(async (runtime) => await removePath(runtime.path)),
  );

  return orphanedRuntimes;
};
