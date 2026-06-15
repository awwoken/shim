import { registerDoctorCommand } from "@/cli/commands/doctor";
import { registerInstallCommand } from "@/cli/commands/install";
import { registerListCommand } from "@/cli/commands/list";
import { registerRemoveCommand } from "@/cli/commands/remove";
import { registerUpgradeCommand } from "@/cli/commands/upgrade";
import { registerWhichCommand } from "@/cli/commands/which";
import { Command } from "commander";

import packageJson from "../../package.json";

export const createProgram = (): Command => {
  const program = new Command();

  program
    .name("shim")
    .description("Install CLI tools with isolated managed runtimes.")
    .version(packageJson.version);

  registerInstallCommand(program);
  registerRemoveCommand(program);
  registerListCommand(program);
  registerUpgradeCommand(program);
  registerDoctorCommand(program);
  registerWhichCommand(program);

  return program;
};
