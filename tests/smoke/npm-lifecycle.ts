import { join } from "node:path";

import { expectSuccess, runShim } from "../helpers/run-shim";
import { createTestHome, removeTestHome } from "../helpers/test-home";

const SMOKE_PACKAGE = "prettier@3.6.2";
const SMOKE_BIN = "prettier";
const EXIT_SUCCESS = 0;

const writeStep = async (message: string): Promise<void> => {
  await Bun.write(Bun.stdout, `${message}\n`);
};

const assertContains = (value: string, expected: string): void => {
  if (value.includes(expected)) {
    return;
  }

  throw new Error(`Expected output to contain ${expected}.\nOutput:\n${value}`);
};

const runExecutable = async (path: string, args: string[]): Promise<string> => {
  const child = Bun.spawn([path, ...args], {
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);

  if (exitCode === EXIT_SUCCESS) {
    return stdout;
  }

  throw new Error(`Executable failed.\nstdout:\n${stdout}\nstderr:\n${stderr}`);
};

const main = async (): Promise<void> => {
  const home = await createTestHome();

  try {
    await writeStep(`Using temporary SHIM_HOME ${home.root}`);

    await writeStep(`Installing ${SMOKE_PACKAGE}`);
    const install = await runShim({
      home: home.root,
      args: ["install", SMOKE_PACKAGE],
    });
    expectSuccess(install);
    assertContains(install.stdout, "Installed prettier@3.6.2");

    await writeStep("Listing installed tools");
    const list = await runShim({ home: home.root, args: ["list"] });
    expectSuccess(list);
    assertContains(list.stdout, "prettier");
    assertContains(list.stdout, "3.6.2");

    await writeStep("Resolving shim path");
    const which = await runShim({
      home: home.root,
      args: ["which", SMOKE_BIN],
    });
    expectSuccess(which);

    const shimPath = which.stdout.trim();

    if (shimPath !== join(home.bin, SMOKE_BIN)) {
      throw new Error(`Expected ${join(home.bin, SMOKE_BIN)}, got ${shimPath}`);
    }

    await writeStep("Executing generated shim");
    const version = await runExecutable(shimPath, ["--version"]);

    assertContains(version, "3.6.2");

    await writeStep("Running doctor");
    expectSuccess(await runShim({ home: home.root, args: ["doctor"] }));

    await writeStep("Removing package");
    const remove = await runShim({
      home: home.root,
      args: ["remove", SMOKE_BIN],
    });
    expectSuccess(remove);
    assertContains(remove.stdout, "Removed prettier@3.6.2");

    await writeStep("Verifying empty state");
    const emptyList = await runShim({ home: home.root, args: ["list"] });
    expectSuccess(emptyList);
    assertContains(emptyList.stdout, "No tools installed.");

    await writeStep("Smoke test passed");
  } finally {
    await removeTestHome(home);
  }
};

await main();
