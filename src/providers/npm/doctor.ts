import { readFile } from "node:fs/promises";
import { join } from "node:path";

import type { ShimDoctor, ToolDoctor } from "@/core/doctor";
import { npmBinPath } from "@/runtimes/node";
import { assertDirectory, pathExists } from "@/support/fs";
import { isExpectedFsProbeError } from "@/support/fs/errors";

import {
  hasNpmShimMetadataBins,
  isSafeNpmBinName,
  npmShimMetadataRecordsBin,
  npmShimPath,
  renderExpectedNpmShimContent,
} from "./shim-content";

const readShimContent = async (
  shimPath: string,
): Promise<string | undefined> => {
  try {
    return await readFile(shimPath, "utf8");
  } catch (caughtError) {
    if (isExpectedFsProbeError(caughtError)) {
      return undefined;
    }

    throw caughtError;
  }
};

export const checkNpmTool: ToolDoctor = async ({
  paths,
  tool,
  metadata,
  checks,
}): Promise<void> => {
  const npmPath = npmBinPath(paths, tool.runtime.version);
  const prefixPath = join(tool.toolPath, "npm-prefix");
  const npmExists = await pathExists(npmPath);
  const prefixExists = await assertDirectory(prefixPath);

  checks.push({
    level: npmExists ? "ok" : "error",
    message: `Npm executable exists for ${tool.runtime.kind} ${tool.runtime.version}`,
    hint: npmExists ? undefined : "Reinstall or upgrade the affected tool.",
  });
  checks.push({
    level: prefixExists ? "ok" : "error",
    message: `Package prefix exists for ${metadata.packageName}@${metadata.packageVersion}`,
    hint: prefixExists
      ? undefined
      : "Reinstall the tool or remove stale registry state.",
  });
};

export const checkNpmShim: ShimDoctor = async ({
  paths,
  tool,
  metadata,
  binName,
  checks,
}): Promise<void> => {
  if (!isSafeNpmBinName(binName)) {
    checks.push({
      level: "error",
      message: `Registry records safe shim name ${binName}`,
      hint: "Reinstall the tool or remove stale registry state.",
    });

    return;
  }

  const shimPath = npmShimPath(paths, binName);

  if (!hasNpmShimMetadataBins(metadata)) {
    checks.push({
      level: "error",
      message: `Shim metadata is well formed for ${binName}`,
      hint: "Reinstall the tool or remove stale registry state.",
    });

    return;
  }

  if (!npmShimMetadataRecordsBin(metadata, binName)) {
    checks.push({
      level: "error",
      message: `Metadata records shim ${binName}`,
      hint: "Reinstall the tool or remove stale registry state.",
    });

    return;
  }

  const expectedContent = renderExpectedNpmShimContent({
    paths,
    tool,
    metadata,
    binName,
  });

  if (expectedContent === undefined) {
    checks.push({
      level: "error",
      message: `Shim metadata has supported and safe entry for ${binName}`,
      hint: "Reinstall the tool to regenerate shim metadata.",
    });

    return;
  }

  const currentContent = await readShimContent(shimPath);
  const matchesExpected = currentContent === expectedContent;

  checks.push({
    level: matchesExpected ? "ok" : "error",
    message: `Shim content matches expected generated content ${shimPath}`,
    hint: matchesExpected
      ? undefined
      : "Reinstall the tool to regenerate the shim.",
  });
};
