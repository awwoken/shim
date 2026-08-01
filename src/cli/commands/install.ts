import { writeOut } from "@/cli/output";
import { colorSuccess } from "@/cli/output/colors";
import { createCliReporter } from "@/cli/output/reporter";
import { loadConfig } from "@/core/config";
import { selectProviderForSpec } from "@/providers";
import { withMutationLock } from "@/support/lock";
import { getShimPaths } from "@/support/paths";
import type { Command } from "commander";

type InstallCommandOptions = {
  runtime?: string;
  force?: boolean;
  ignoreScripts?: boolean;
  expose?: boolean;
};

export const registerInstallCommand = (program: Command): void => {
  program
    .command("install")
    .argument("<package-spec>")
    .option("--runtime <version>", "target runtime version, major, or lts")
    .option("--force", "replace existing bin shims")
    .option("--ignore-scripts", "disable package lifecycle scripts")
    .option(
      "--expose",
      "make this npm package resolvable by other managed Node tools",
    )
    .description("install a CLI tool into an isolated prefix")
    .action(
      async (
        packageSpec: string,
        options: InstallCommandOptions,
      ): Promise<void> => {
        const paths = getShimPaths();
        const config = await loadConfig(paths);
        const selection = selectProviderForSpec(packageSpec);
        const reporter = createCliReporter();
        const providerMessage = selection.explicit
          ? `Using provider ${selection.provider.id}`
          : `Using default provider ${selection.provider.id}`;

        reporter.info(providerMessage);

        const tool = await withMutationLock(
          paths,
          async () =>
            await selection.provider.install({
              paths,
              config,
              packageSpec: selection.spec,
              options: {
                runtime: options.runtime,
                force: options.force ?? false,
                ignoreScripts: options.ignoreScripts ?? false,
                expose: options.expose ?? false,
              },
              reporter,
            }),
        );

        writeOut(
          colorSuccess(
            `Installed ${tool.packageName}@${tool.packageVersion} with ${tool.runtime.kind} ${tool.runtime.version}`,
          ),
          { leadingBlankLine: true },
        );
      },
    );
};
