import { writeOut } from "@/cli/output";
import { colorSuccess } from "@/cli/output/colors";
import { createCliReporter } from "@/cli/output/reporter";
import { selectProviderForSpec } from "@/providers";
import { withMutationLock } from "@/support/lock";
import { getShimPaths } from "@/support/paths";
import type { Command } from "commander";

export const registerRemoveCommand = (program: Command): void => {
  program
    .command("remove")
    .argument("<package-or-bin>")
    .description("remove an installed package or bin shim")
    .action(async (packageOrBin: string): Promise<void> => {
      const paths = getShimPaths();
      const { provider, spec } = selectProviderForSpec(packageOrBin);
      const tool = await withMutationLock(
        paths,
        async () =>
          await provider.remove({
            paths,
            packageOrBin: spec,
            reporter: createCliReporter(),
          }),
      );

      writeOut(
        colorSuccess(`Removed ${tool.packageName}@${tool.packageVersion}`),
        {
          leadingBlankLine: true,
        },
      );
    });
};
