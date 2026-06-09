const EXIT_SUCCESS = 0;

type RunExecutableInput = {
  path: string;
  env?: Record<string, string>;
};

export const runExecutable = async ({
  path,
  env,
}: RunExecutableInput): Promise<string> => {
  const child = Bun.spawn([path], {
    env,
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    child.stdout.text(),
    child.stderr.text(),
    child.exited,
  ]);

  if (exitCode === EXIT_SUCCESS) {
    return stdout;
  }

  throw new Error(`Executable failed.\nstdout:\n${stdout}\nstderr:\n${stderr}`);
};
