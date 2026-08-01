import { readFile } from "node:fs/promises";

import type { RepairResult, ShimRepairer } from "@/core/repair";
import {
  ensureExecutable,
  isExecutable,
  isRegularFile,
  writeFileAtomic,
} from "@/support/fs";
import { isExpectedFsProbeError } from "@/support/fs/errors";

import {
  hasNpmShimMetadataBins,
  isSafeNpmBinName,
  npmShimMetadataRecordsBin,
  npmShimPath,
  renderExpectedNpmShimContent,
} from "./shim-content";

const readCurrentShimContent = async (
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

const skipped = (message: string, hint: string): RepairResult => ({
  status: "skipped",
  message,
  hint,
});

export const repairNpmShim: ShimRepairer = async ({
  paths,
  tool,
  metadata,
  binName,
}): Promise<RepairResult> => {
  if (!isSafeNpmBinName(binName)) {
    return skipped(
      `Skipped ${binName}; registry records an unsafe shim name`,
      "Reinstall the tool or remove stale registry state.",
    );
  }

  const shimPath = npmShimPath(paths, binName);

  if (!hasNpmShimMetadataBins(metadata)) {
    return skipped(
      `Skipped ${binName}; shim metadata is malformed`,
      "Reinstall the tool or remove stale registry state.",
    );
  }

  if (!npmShimMetadataRecordsBin(metadata, binName)) {
    return skipped(
      `Skipped ${binName}; metadata does not record this shim`,
      "Reinstall the tool or remove stale registry state.",
    );
  }

  const expectedContent = renderExpectedNpmShimContent({
    paths,
    tool,
    metadata,
    binName,
  });

  if (expectedContent === undefined) {
    return skipped(
      `Skipped ${binName}; shim metadata has an unsupported or unsafe entry`,
      "Reinstall the tool to regenerate shim metadata.",
    );
  }

  let currentContent: string | undefined;
  let executable = false;

  if (await isRegularFile(shimPath)) {
    [currentContent, executable] = await Promise.all([
      readCurrentShimContent(shimPath),
      isExecutable(shimPath),
    ]);
  }

  const contentMatches = currentContent === expectedContent;

  if (contentMatches && executable) {
    return {
      status: "ok",
      message: `Shim already matches expected generated content ${shimPath}`,
    };
  }

  if (!contentMatches) {
    await writeFileAtomic(shimPath, expectedContent);
  }

  await ensureExecutable(shimPath);

  return {
    status: "repaired",
    message: `Repaired shim ${shimPath}`,
  };
};
