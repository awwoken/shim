import { writeOut } from "@/cli/output";
import { colorSuccess } from "@/cli/output/colors";
import {
  findOrphanedRuntimes,
  removeOrphanedRuntimes,
  type OrphanedRuntime,
} from "@/core/prune";
import { isEmptyArray } from "@/support/collections";
import { AppError } from "@/support/errors";
import { withMutationLock } from "@/support/lock";
import { getShimPaths } from "@/support/paths";
import type { Command } from "commander";

const pluralRules = new Intl.PluralRules("en-US");

const renderRuntime = (runtime: OrphanedRuntime): string =>
  `${runtime.kind} ${runtime.version}  ${runtime.path}`;

const runtimeCountLabel = (count: number): string => {
  const noun = pluralRules.select(count) === "one" ? "runtime" : "runtimes";

  return `${count} orphaned ${noun}`;
};

const renderRuntimeList = (runtimes: OrphanedRuntime[]): string =>
  runtimes.map(renderRuntime).join("\n");

type PruneCommandOptions = {
  dryRun?: boolean;
  yes?: boolean;
};

export const registerPruneCommand = (program: Command): void => {
  program
    .command("prune")
    .description("remove managed runtimes that are not used by installed tools")
    .option("--dry-run", "show orphaned runtimes without removing them")
    .option("--yes", "remove orphaned runtimes without prompting")
    .action(async (options: PruneCommandOptions): Promise<void> => {
      if (options.dryRun === true && options.yes === true) {
        throw new AppError("Choose either --dry-run or --yes, not both");
      }

      const paths = getShimPaths();

      if (options.yes === true) {
        const removedRuntimes = await withMutationLock(
          paths,
          async () => await removeOrphanedRuntimes(paths),
        );

        if (isEmptyArray(removedRuntimes)) {
          writeOut("No orphaned runtimes found.");

          return;
        }

        writeOut(
          [
            colorSuccess(
              `Removed ${runtimeCountLabel(removedRuntimes.length)}:`,
            ),
            renderRuntimeList(removedRuntimes),
          ].join("\n"),
        );

        return;
      }

      const orphanedRuntimes = await findOrphanedRuntimes(paths);

      if (isEmptyArray(orphanedRuntimes)) {
        writeOut("No orphaned runtimes found.");

        return;
      }

      writeOut(
        [
          `Would remove ${runtimeCountLabel(orphanedRuntimes.length)}:`,
          renderRuntimeList(orphanedRuntimes),
          "Run shim prune --yes to remove them.",
        ].join("\n"),
      );
    });
};
