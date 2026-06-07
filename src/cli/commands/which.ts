import { join } from "node:path";

import { writeOut } from "@/cli/output";
import { loadRegistry } from "@/core/registry";
import { AppError } from "@/support/errors";
import { getShimPaths } from "@/support/paths";
import type { Command } from "commander";

export const registerWhichCommand = (program: Command): void => {
  program
    .command("which")
    .argument("<bin>")
    .description("show the shim path for a bin")
    .action(async (bin: string): Promise<void> => {
      const paths = getShimPaths();
      const registry = await loadRegistry(paths);
      const owner = registry.bins[bin];

      if (owner === undefined) {
        throw new AppError(`Bin "${bin}" is not installed`);
      }

      writeOut(join(paths.bin, bin));
    });
};
