import { rename } from "node:fs/promises";
import { join } from "node:path";

import type { ShimConfig } from "@/core/config";
import { ensureShimHome } from "@/core/home";
import type {
  InstallOptions,
  InstallPolicy,
  RegistryTool,
} from "@/core/models";
import {
  checkBinConflicts,
  loadRegistry,
  saveRegistry,
  upsertTool,
} from "@/core/registry";
import type { Reporter } from "@/core/reporter";
import { AppError, toErrorMessage } from "@/support/errors";
import { ensureDir, removePath, writeJsonAtomic } from "@/support/fs";
import type { ShimPaths } from "@/support/paths";

import {
  commitNpmPackageExposureUpdate,
  rollbackNpmPackageExposureUpdate,
  updateNpmPackageExposure,
  type NpmExposureUpdate,
} from "./exposure";
import { runNpmInstall, selectNpmInstallNodeVersion } from "./installer";
import { resolveNpmPackage } from "./metadata";
import {
  npmMetadataPath,
  npmPackageRoot,
  npmStagePath,
  npmToolPath,
} from "./paths";
import {
  createInitialMetadata,
  createNpmRegistryTool,
  getNpmToolId,
} from "./registry";
import {
  backupExistingNpmToolPath,
  backupNpmShims,
  removeNpmToolPathBackup,
  removeSupersededNpmToolPath,
  restoreNpmShims,
  restoreNpmToolPathBackup,
} from "./shim-backups";
import {
  createNpmShims,
  discoverNpmBinNames,
  removeDisplacedNpmTools,
  removeStaleNpmShims,
  renderNpmExecutableSummary,
} from "./shims";

type InstallNpmPackageInput = {
  paths: ShimPaths;
  config: ShimConfig;
  packageSpec: string;
  options: InstallOptions;
  reporter: Reporter;
};

export const installNpmPackage = async ({
  paths,
  config,
  packageSpec,
  options,
  reporter,
}: InstallNpmPackageInput): Promise<RegistryTool> => {
  await ensureShimHome(paths);
  reporter.info(`Using shim home ${paths.home}`);
  reporter.info("");

  const registry = await loadRegistry(paths);
  const metadata = await resolveNpmPackage({
    paths,
    config,
    packageSpec,
    reporter,
  });
  const existingTool = registry.tools[getNpmToolId(metadata.name)];

  if (existingTool !== undefined && !options.force) {
    reporter.info("");

    throw new AppError(
      `${metadata.name} is already installed as ${existingTool.packageName}@${existingTool.packageVersion}`,
      "Use --force to replace it",
    );
  }

  reporter.info("");

  const targetNode = await selectNpmInstallNodeVersion({
    paths,
    config,
    enginesNode: metadata.enginesNode,
    runtimeOverride: options.runtime,
    reporter,
  });

  reporter.info("");

  const stagePath = npmStagePath(paths);
  const stagePrefixPath = join(stagePath, "npm-prefix");
  const finalToolPath = npmToolPath(paths, metadata.name, metadata.version);
  const packageRoot = npmPackageRoot(paths, metadata.name);

  await removePath(stagePath);
  await ensureDir(stagePrefixPath);

  const installPolicy: InstallPolicy = {
    ignoreScripts: options.ignoreScripts,
    runtimeOverride: options.runtime,
    expose: options.expose,
  };
  const previousBins = existingTool === undefined ? [] : existingTool.bins;
  let stageWasPromoted = false;
  let shimBackups: Awaited<ReturnType<typeof backupNpmShims>> = [];
  let toolPathBackup: Awaited<ReturnType<typeof backupExistingNpmToolPath>> = {
    finalToolPath,
  };
  let exposureUpdate: NpmExposureUpdate | undefined;

  try {
    reporter.info(
      `Installing ${metadata.name}@${metadata.version} into ${finalToolPath}`,
    );
    await runNpmInstall({
      paths,
      config,
      nodeVersion: targetNode,
      prefixPath: stagePrefixPath,
      packageName: metadata.name,
      packageVersion: metadata.version,
      ignoreScripts: options.ignoreScripts,
    });

    const binNames = await discoverNpmBinNames(stagePrefixPath);
    reporter.info(renderNpmExecutableSummary(binNames));
    await checkBinConflicts({
      paths,
      registry,
      binNames,
      force: options.force,
      replaceToolId: options.replaceToolId,
    });

    shimBackups = await backupNpmShims({
      paths,
      nextBins: binNames,
      previousBins,
    });

    const initialMetadata = createInitialMetadata({
      packageName: metadata.name,
      packageVersion: metadata.version,
      packageSpec,
      nodeVersion: targetNode,
      enginesNode: metadata.enginesNode,
      installPolicy,
    });

    await writeJsonAtomic(join(stagePath, "shim.json"), initialMetadata);

    toolPathBackup = await backupExistingNpmToolPath({
      finalToolPath,
      force: options.force,
      packageRoot,
      packageName: metadata.name,
      packageVersion: metadata.version,
    });

    if (toolPathBackup.backupPath !== undefined) {
      reporter.info(`Moved existing tool path ${finalToolPath} aside`);
    }

    await ensureDir(packageRoot);
    await rename(stagePath, finalToolPath);
    stageWasPromoted = true;

    const shimMetadata = await createNpmShims({
      paths,
      packageName: metadata.name,
      packageVersion: metadata.version,
      nodeVersion: targetNode,
      binNames,
      reporter,
    });

    const finalMetadataPath = npmMetadataPath(
      paths,
      metadata.name,
      metadata.version,
    );
    await writeJsonAtomic(finalMetadataPath, {
      ...initialMetadata,
      bins: shimMetadata,
    });
    reporter.info(`Wrote metadata ${finalMetadataPath}`);

    exposureUpdate = await updateNpmPackageExposure({
      paths,
      packageName: metadata.name,
      packageVersion: metadata.version,
      expose: options.expose,
      reporter,
    });

    const tool = createNpmRegistryTool({
      paths,
      packageName: metadata.name,
      packageVersion: metadata.version,
      packageSpec,
      nodeVersion: targetNode,
      installedAt: initialMetadata.installedAt,
      binNames,
      installPolicy,
    });

    await removeStaleNpmShims({
      paths,
      previousBins,
      nextBins: binNames,
      reporter,
    });
    const upsertResult = upsertTool(registry, tool);
    await saveRegistry(paths, upsertResult.registry);
    reporter.info(`Updated registry ${paths.registry}`);

    await removeDisplacedNpmTools({
      paths,
      tools: upsertResult.displacedTools,
      retainedBins: binNames,
      reporter,
    });

    await removeSupersededNpmToolPath({
      previousToolPath: existingTool?.toolPath,
      nextToolPath: finalToolPath,
      reporter,
    });

    try {
      await removeNpmToolPathBackup(toolPathBackup);
    } catch (caughtError) {
      reporter.info(
        `Could not remove replacement backup: ${toErrorMessage(caughtError)}`,
      );
    }

    try {
      await commitNpmPackageExposureUpdate(exposureUpdate);
    } catch (caughtError) {
      reporter.info(
        `Could not remove exposure backup: ${toErrorMessage(caughtError)}`,
      );
    }

    return tool;
  } catch (error) {
    await removePath(stagePath);

    if (stageWasPromoted) {
      await removePath(finalToolPath);
    }

    await restoreNpmToolPathBackup(toolPathBackup);
    await rollbackNpmPackageExposureUpdate(exposureUpdate);
    await restoreNpmShims(shimBackups);

    throw error;
  }
};
