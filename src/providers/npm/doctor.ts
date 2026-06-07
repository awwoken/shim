import { join } from "node:path";

import type { ToolDoctor } from "@/core/doctor";
import { npmBinPath } from "@/runtimes/node";
import { assertDirectory, pathExists } from "@/support/fs";

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
