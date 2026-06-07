import { AppError } from "@/support/errors";
import { EXIT_SUCCESS } from "@/support/process/constants";

export type CommandResult = {
  stdout: string;
  stderr: string;
};

const hasText = (value: string): boolean => value.trim() !== "";

export const runCommand = async (
  command: string,
  args: string[],
  options: { cwd?: string; env?: Record<string, string> } = {},
): Promise<CommandResult> => {
  const child = Bun.spawn([command, ...args], {
    cwd: options.cwd,
    env: options.env,
    stdout: "pipe",
    stderr: "pipe",
  });

  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);

  if (exitCode !== EXIT_SUCCESS) {
    const renderedCommand = [command, ...args].join(" ");
    const detail = hasText(stderr) ? stderr.trim() : stdout.trim();

    throw new AppError(
      `Command failed with exit code ${exitCode} while running ${renderedCommand}`,
      hasText(detail) ? detail : undefined,
    );
  }

  return { stdout, stderr };
};
