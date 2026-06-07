import { randomUUID } from "node:crypto";
import { rename } from "node:fs/promises";
import { join } from "node:path";

import type { ShimConfig } from "@/core/config";
import { ensureShimHome } from "@/core/home";
import type { InstallOptions, RegistryTool } from "@/core/models";
import {
  checkBinConflicts,
  loadRegistry,
  saveRegistry,
  upsertTool,
} from "@/core/registry";
import type { Reporter } from "@/core/reporter";
import {
  ensureNodeRuntime,
  fetchNodeReleases,
  selectLatestLts,
  selectNodeVersion,
} from "@/runtimes/node";
import { NODE_RUNTIME_ID } from "@/runtimes/node/constants";
import { AppError } from "@/support/errors";
import {
  ensureDir,
  pathExists,
  removePath,
  writeJsonAtomic,
} from "@/support/fs";
import type { ShimPaths } from "@/support/paths";

import { runNpmInstall } from "./installer";
import { resolveNpmPackage } from "./metadata";
import { npmMetadataPath, npmPackageRoot, npmToolPath } from "./paths";
import {
  createInitialMetadata,
  createNpmRegistryTool,
  getNpmToolId,
} from "./registry";
import { backupNpmShims, restoreNpmShims } from "./shim-backups";
import {
  createNpmShims,
  discoverNpmBinNames,
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

  const nodeConfig = config.runtimes[NODE_RUNTIME_ID];
  const releases = await fetchNodeReleases(nodeConfig);
  const bootstrapNode =
    nodeConfig.bootstrapVersion ?? selectLatestLts(releases);
  const targetNode =
    options.runtime === undefined && metadata.enginesNode === undefined
      ? bootstrapNode
      : selectNodeVersion(releases, metadata.enginesNode, options.runtime);

  if (options.runtime !== undefined) {
    reporter.info(
      `Using runtime override ${options.runtime}; selected node ${targetNode}`,
    );
  } else if (metadata.enginesNode === undefined) {
    reporter.info(
      `Package did not declare node requirement; using bootstrap node ${bootstrapNode}`,
    );
  } else {
    reporter.info(
      `Package requires node ${metadata.enginesNode}; selected node ${targetNode}`,
    );
  }

  if (targetNode !== bootstrapNode) {
    await ensureNodeRuntime({
      paths,
      config: nodeConfig,
      version: targetNode,
      reporter,
    });
  }

  reporter.info("");

  const stagePath = join(paths.tmp, `npm-${randomUUID()}`);
  const stagePrefixPath = join(stagePath, "npm-prefix");
  const finalToolPath = npmToolPath(paths, metadata.name, metadata.version);
  const packageRoot = npmPackageRoot(paths, metadata.name);

  await removePath(stagePath);
  await ensureDir(stagePrefixPath);

  const previousBins = existingTool === undefined ? [] : existingTool.bins;
  let stageWasPromoted = false;
  let shimBackups: Awaited<ReturnType<typeof backupNpmShims>> = [];

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
    });

    await writeJsonAtomic(join(stagePath, "shim.json"), initialMetadata);

    if (await pathExists(finalToolPath)) {
      if (!options.force) {
        throw new AppError(
          `${metadata.name}@${metadata.version} is already installed`,
        );
      }

      await removePath(finalToolPath);
      reporter.info(`Replaced existing tool path ${finalToolPath}`);
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

    const tool = createNpmRegistryTool({
      paths,
      packageName: metadata.name,
      packageVersion: metadata.version,
      packageSpec,
      nodeVersion: targetNode,
      installedAt: initialMetadata.installedAt,
      binNames,
    });

    await removeStaleNpmShims({
      paths,
      previousBins,
      nextBins: binNames,
      reporter,
    });
    await saveRegistry(paths, upsertTool(registry, tool));
    reporter.info(`Updated registry ${paths.registry}`);

    return tool;
  } catch (error) {
    await removePath(stagePath);

    if (stageWasPromoted) {
      await removePath(finalToolPath);
    }

    await restoreNpmShims(shimBackups);

    throw error;
  }
};
