import { join } from "node:path";

import { writeOut } from "@/cli/output";
import { renderDoctorCheck } from "@/cli/output/doctor";
import {
  checkDirectory,
  type DoctorCheck,
  type DoctorReport,
} from "@/core/doctor";
import type { Registry, RegistryTool, ShimMetadata } from "@/core/models";
import { loadRegistry } from "@/core/registry";
import { providerDoctors, providerShimDoctors } from "@/providers/doctor";
import { runtimeDoctors } from "@/runtimes/doctor";
import { isEmptyArray } from "@/support/collections";
import { isExecutable, pathExists, readJsonFile } from "@/support/fs";
import { getShimPaths, type ShimPaths } from "@/support/paths";
import type { Command } from "commander";

const getPathParts = (): string[] => (Bun.env["PATH"] ?? "").split(":");

const checkPath = (checks: DoctorCheck[], binPath: string): void => {
  const pathParts = getPathParts();
  const isPresent = pathParts.includes(binPath);

  checks.push({
    level: isPresent ? "ok" : "warn",
    message: isPresent
      ? `${binPath} is in PATH.`
      : `${binPath} is not in PATH.`,
    hint: isPresent ? undefined : `Add ${binPath} to PATH.`,
  });
};

const findExecutableInPaths = async (
  pathParts: string[],
  binName: string,
): Promise<string | undefined> => {
  for (const pathPart of pathParts) {
    if (pathPart === "") {
      continue;
    }

    const candidate = join(pathPart, binName);

    if (await isExecutable(candidate)) {
      return candidate;
    }
  }

  return undefined;
};

const checkPathShadowing = async (
  paths: ShimPaths,
  registry: Registry,
): Promise<DoctorCheck[]> => {
  const pathParts = getPathParts();

  if (!pathParts.includes(paths.bin)) {
    return [];
  }

  const shimBinIndex = pathParts.indexOf(paths.bin);
  const earlierPathParts = pathParts.slice(undefined, shimBinIndex);
  const checks: DoctorCheck[] = [];

  for (const binName of Object.keys(registry.bins).toSorted()) {
    const shadowPath = await findExecutableInPaths(earlierPathParts, binName);

    if (shadowPath === undefined) {
      checks.push({
        level: "ok",
        message: `Executable ${binName} resolves to shim before other PATH entries.`,
      });
    } else {
      checks.push({
        level: "warn",
        message: `Executable ${binName} is shadowed by ${shadowPath}`,
        hint: `Move ${paths.bin} earlier in PATH or remove ${shadowPath}.`,
      });
    }
  }

  return checks;
};

type CheckBinInput = {
  paths: ShimPaths;
  tool: RegistryTool;
  metadata: ShimMetadata;
  binName: string;
  checks: DoctorCheck[];
};

const checkBin = async ({
  paths,
  tool,
  metadata,
  binName,
  checks,
}: CheckBinInput): Promise<void> => {
  const shimPath = join(paths.bin, binName);

  const shimExists = await pathExists(shimPath);
  const shimIsExecutable = await isExecutable(shimPath);

  checks.push({
    level: shimExists ? "ok" : "error",
    message: `Shim exists ${shimPath}`,
    hint: shimExists
      ? undefined
      : "Reinstall the tool or remove stale registry state.",
  });
  checks.push({
    level: shimIsExecutable ? "ok" : "error",
    message: `Shim is executable ${shimPath}`,
    hint: shimIsExecutable
      ? undefined
      : `Run chmod +x ${shimPath} or reinstall the tool.`,
  });

  const shimDoctor = providerShimDoctors[tool.provider];

  if (shimDoctor === undefined) {
    checks.push({
      level: "error",
      message: `Unsupported provider for shim validation ${tool.provider}`,
      hint: "Install a shim version that supports this provider or remove the affected tool.",
    });

    return;
  }

  await shimDoctor({ paths, tool, metadata, binName, checks });
};

type DoctorSections = {
  toolChecks: DoctorCheck[];
  shimChecks: DoctorCheck[];
};

type CheckToolInput = {
  paths: ShimPaths;
  tool: RegistryTool;
};

const checkTool = async ({
  paths,
  tool,
}: CheckToolInput): Promise<DoctorSections> => {
  const toolChecks: DoctorCheck[] = [];
  const shimChecks: DoctorCheck[] = [];

  const metadataExists = await pathExists(tool.metadataPath);

  toolChecks.push({
    level: metadataExists ? "ok" : "error",
    message: `Metadata exists ${tool.metadataPath}`,
    hint: metadataExists
      ? undefined
      : "Reinstall the tool or remove stale registry state.",
  });

  const metadata = await readJsonFile<ShimMetadata>(tool.metadataPath);

  if (metadata === undefined) {
    return { toolChecks, shimChecks };
  }

  const runtimeDoctor = runtimeDoctors[tool.runtime.kind];
  const providerDoctor = providerDoctors[tool.provider];

  if (runtimeDoctor === undefined) {
    toolChecks.push({
      level: "error",
      message: `Unsupported runtime in registry ${tool.runtime.kind}`,
      hint: "Install a shim version that supports this runtime or remove the affected tool.",
    });
  } else {
    await runtimeDoctor({ paths, tool, metadata, checks: toolChecks });
  }

  if (providerDoctor === undefined) {
    toolChecks.push({
      level: "error",
      message: `Unsupported provider in registry ${tool.provider}`,
      hint: "Install a shim version that supports this provider or remove the affected tool.",
    });
  } else {
    await providerDoctor({ paths, tool, metadata, checks: toolChecks });
  }

  for (const binName of tool.bins) {
    await checkBin({ paths, tool, metadata, binName, checks: shimChecks });
  }

  return { toolChecks, shimChecks };
};

const checkRegistry = async (
  paths: ShimPaths,
  registry: Registry,
): Promise<DoctorCheck[][]> => {
  const sections: DoctorCheck[][] = [];

  for (const tool of Object.values(registry.tools)) {
    const { toolChecks, shimChecks } = await checkTool({ paths, tool });

    sections.push(toolChecks, shimChecks);
  }

  return sections;
};

const renderSections = (sections: DoctorCheck[][]): string =>
  sections
    .filter((section) => !isEmptyArray(section))
    .map((section) => section.map(renderDoctorCheck).join("\n"))
    .join("\n\n");

export const runDoctor = async (paths: ShimPaths): Promise<DoctorReport> => {
  const directoryChecks: DoctorCheck[] = [];
  const pathChecks: DoctorCheck[] = [];

  await checkDirectory({
    checks: directoryChecks,
    path: paths.home,
    message: "Shim home exists",
    hint: "Run shim install <package> to initialize the shim home.",
  });
  await checkDirectory({
    checks: directoryChecks,
    path: paths.bin,
    message: "Bin directory exists",
    hint: "Run shim install <package> to initialize the bin directory.",
  });
  await checkDirectory({
    checks: directoryChecks,
    path: paths.runtimes,
    message: "Runtimes directory exists",
    hint: "Run shim install <package> to initialize runtimes.",
  });
  await checkDirectory({
    checks: directoryChecks,
    path: paths.tools,
    message: "Tools directory exists",
    hint: "Run shim install <package> to initialize tools.",
  });
  checkPath(pathChecks, paths.bin);

  const registry = await loadRegistry(paths);
  const shadowChecks = await checkPathShadowing(paths, registry);
  const registrySections = await checkRegistry(paths, registry);
  const sections = [
    directoryChecks,
    pathChecks,
    shadowChecks,
    ...registrySections,
  ];
  const checks = sections.flat();
  const ok = checks.every((check) => check.level !== "error");
  const text = renderSections(sections);

  return { ok, text };
};

export const registerDoctorCommand = (program: Command): void => {
  program
    .command("doctor")
    .description("check shim installation health")
    .action(async (): Promise<void> => {
      const report = await runDoctor(getShimPaths());
      writeOut(report.text);

      if (!report.ok) {
        process.exitCode = 1;
      }
    });
};
