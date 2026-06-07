import type { ToolDoctor } from "@/core/doctor";
import { nodeBinPath } from "@/runtimes/node";
import { pathExists } from "@/support/fs";

export const checkNodeRuntime: ToolDoctor = async ({
  paths,
  tool,
  checks,
}): Promise<void> => {
  const nodePath = nodeBinPath(paths, tool.runtime.version);
  const exists = await pathExists(nodePath);

  checks.push({
    level: exists ? "ok" : "error",
    message: `Node runtime exists ${tool.runtime.version}`,
    hint: exists ? undefined : "Reinstall or upgrade the affected tool.",
  });
};
