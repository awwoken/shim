import { expect, test } from "bun:test";

import {
  expectPathExists,
  expectPathMissing,
} from "../support/assertions/filesystem";
import {
  expectBinOwner,
  expectRegistryToolPath,
  expectToolInstalled,
  expectToolMissing,
  registryToolPath,
} from "../support/assertions/registry";
import { npmPackageWithBins } from "../support/fixtures/npm-package";
import { withNpmShimHome } from "../support/harness/npm-shim-home";
import {
  expectBinaryFailure,
  expectBinarySuccess,
} from "../support/process/run-binary";

test("force install fully displaces previous bin owner", async () => {
  await withNpmShimHome(
    {
      packages: [
        npmPackageWithBins("tsc", "2.0.4", ["tsc"]),
        npmPackageWithBins("typescript", "5.9.3", ["tsc", "tsserver"]),
      ],
    },
    async ({ home, shim }) => {
      expectBinarySuccess(await shim.install("tsc@2.0.4"));

      const previousToolPath = await expectRegistryToolPath(
        home.registry,
        "npm:tsc",
      );

      await expectPathExists(previousToolPath);

      expectBinarySuccess(await shim.install("typescript@5.9.3", "--force"));

      await expectToolMissing(home.registry, "npm:tsc");
      await expectToolInstalled(home.registry, "npm:typescript");
      await expectBinOwner(home.registry, "tsc", "npm:typescript");
      await expectBinOwner(home.registry, "tsserver", "npm:typescript");
      await expectPathMissing(previousToolPath);
    },
  );
});

test("upgrade cannot take bins owned by another package", async () => {
  await withNpmShimHome(
    {
      packages: [
        npmPackageWithBins("bin-owner", "1.0.0", ["shared-bin"]),
        npmPackageWithBins("upgrade-target", "1.0.0", ["upgrade-target"]),
        npmPackageWithBins("upgrade-target", "2.0.0", [
          "upgrade-target",
          "shared-bin",
        ]),
      ],
    },
    async ({ home, shim }) => {
      expectBinarySuccess(await shim.install("bin-owner@1.0.0"));
      expectBinarySuccess(await shim.install("upgrade-target@1.0.0"));

      const upgrade = await shim.upgrade("upgrade-target");

      expectBinaryFailure(upgrade);
      expect(upgrade.stderr).toContain(
        'Bin "shared-bin" is already installed by bin-owner@1.0.0',
      );
      await expectToolInstalled(home.registry, "npm:upgrade-target");
      await expectBinOwner(home.registry, "shared-bin", "npm:bin-owner");
    },
  );
});

test("remove prefers package names over colliding bin aliases", async () => {
  await withNpmShimHome(
    {
      packages: [
        npmPackageWithBins("tsc", "1.0.0", ["tsc-package"]),
        npmPackageWithBins("typescript", "5.9.3", ["tsc"]),
      ],
    },
    async ({ home, shim }) => {
      expectBinarySuccess(await shim.install("tsc@1.0.0"));
      expectBinarySuccess(await shim.install("typescript@5.9.3"));
      expectBinarySuccess(await shim.remove("npm:tsc"));

      await expectToolMissing(home.registry, "npm:tsc");
      await expectToolInstalled(home.registry, "npm:typescript");
      await expectBinOwner(home.registry, "tsc", "npm:typescript");
    },
  );
});

test("upgrade prefers package names over colliding bin aliases", async () => {
  await withNpmShimHome(
    {
      packages: [
        npmPackageWithBins("tsc", "1.0.0", ["tsc-package"]),
        npmPackageWithBins("tsc", "2.0.0", ["tsc-package"]),
        npmPackageWithBins("typescript", "5.9.3", ["tsc"]),
      ],
    },
    async ({ home, shim }) => {
      expectBinarySuccess(await shim.install("tsc@1.0.0"));
      expectBinarySuccess(await shim.install("typescript@5.9.3"));
      expectBinarySuccess(await shim.upgrade("npm:tsc"));

      await expectToolInstalled(home.registry, "npm:tsc");
      await expectToolInstalled(home.registry, "npm:typescript");
      expect(await registryToolPath(home.registry, "npm:tsc")).toContain(
        "2.0.0",
      );
      await expectBinOwner(home.registry, "tsc", "npm:typescript");
    },
  );
});
