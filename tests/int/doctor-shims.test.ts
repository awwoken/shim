import { expect, test } from "bun:test";
import { join } from "node:path";

import { npmPackage } from "../support/fixtures/npm-package";
import { withNpmShimHome } from "../support/harness/npm-shim-home";
import {
  expectBinaryFailure,
  expectBinarySuccess,
} from "../support/process/run-binary";

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
