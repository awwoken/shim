import { expect, test } from "bun:test";
import { constants } from "node:fs";
import { chmod, symlink, unlink } from "node:fs/promises";
import { join } from "node:path";

import { npmPackage } from "../support/fixtures/npm-package";
import { withNpmShimHome } from "../support/harness/npm-shim-home";
import {
  expectBinaryFailure,
  expectBinarySuccess,
} from "../support/process/run-binary";

test("rejects symlinked shims whose target content matches", async () => {
  await withNpmShimHome(
    { packages: [npmPackage("doctor-symlink", "1.0.0")] },
    async ({ home, shim }) => {
      const shimPath = join(home.bin, "doctor-symlink");
      const targetPath = join(home.root, "external-shim");

      expectBinarySuccess(await shim.install("doctor-symlink@1.0.0"));
      await Bun.write(targetPath, await Bun.file(shimPath).text());
      await chmod(
        targetPath,
        constants.S_IRUSR |
          constants.S_IWUSR |
          constants.S_IXUSR |
          constants.S_IRGRP |
          constants.S_IXGRP |
          constants.S_IROTH |
          constants.S_IXOTH,
      );
      await unlink(shimPath);
      await symlink(targetPath, shimPath);

      const doctor = await shim.run(["doctor"]);

      expectBinaryFailure(doctor);
      expect(doctor.stdout).toContain("Shim is a regular file");
    },
  );
});

test("reports shims whose content does not match generated content", async () => {
  await withNpmShimHome(
    { packages: [npmPackage("doctor-probe", "1.0.0")] },
    async ({ home, shim }) => {
      expectBinarySuccess(await shim.install("doctor-probe@1.0.0"));
      expectBinarySuccess(await shim.run(["doctor"]));

      await Bun.write(join(home.bin, "doctor-probe"), "#!/bin/sh\nexit 0\n");

      const doctor = await shim.run(["doctor"]);

      expectBinaryFailure(doctor);
      expect(doctor.stdout).toContain(
        "Shim content matches expected generated content",
      );
    },
  );
});
