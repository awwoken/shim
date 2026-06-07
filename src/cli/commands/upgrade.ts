import { writeOut } from "@/cli/output";
import { colorSuccess } from "@/cli/output/colors";
import { createCliReporter } from "@/cli/output/reporter";
import { loadConfig } from "@/core/config";
import { getDefaultProvider, selectProviderForSpec } from "@/providers";
import { isEmptyArray } from "@/support/collections";
import { withMutationLock } from "@/support/lock";
import { getShimPaths } from "@/support/paths";
import type { Command } from "commander";

export const registerUpgradeCommand = (program: Command): void => {
  program
    .command("upgrade")
    .argument("[package-or-bin]")
    .description("upgrade an installed package or bin shim")
    .action(async (packageOrBin: string | undefined): Promise<void> => {
      const paths = getShimPaths();
      const config = await loadConfig(paths);
      const selection =
        packageOrBin === undefined
          ? { provider: getDefaultProvider(), spec: undefined }
          : selectProviderForSpec(packageOrBin);
      const results = await withMutationLock(
        paths,
        async () =>
          await selection.provider.upgrade({
            paths,
            config,
            packageOrBin: selection.spec,
            reporter: createCliReporter(),
          }),
      );

      if (isEmptyArray(results)) {
        writeOut("No tools installed.");

        return;
      }

      for (const result of results) {
        if (result.changed) {
          writeOut(
            colorSuccess(
              `Upgraded ${result.packageName} ${result.previousVersion} -> ${result.nextVersion}`,
            ),
          );
        } else {
          writeOut(`${result.packageName} is already up to date.`);
        }
      }
    });
};
