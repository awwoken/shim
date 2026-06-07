import { ensureDir } from "@/support/fs";
import type { ShimPaths } from "@/support/paths";

export const ensureShimHome = async (paths: ShimPaths): Promise<void> => {
  await Promise.all([
    ensureDir(paths.home),
    ensureDir(paths.bin),
    ensureDir(paths.cache),
    ensureDir(paths.locks),
    ensureDir(paths.runtimes),
    ensureDir(paths.tmp),
    ensureDir(paths.tools),
  ]);
};
