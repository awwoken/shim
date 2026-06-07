import { writeOut } from "@/cli/output";
import { loadRegistry } from "@/core/registry";
import { isEmptyArray } from "@/support/collections";
import { getShimPaths, type ShimPaths } from "@/support/paths";
import type { Command } from "commander";

const renderTable = (headers: string[], rows: string[][]): string => {
  const widths = headers.map((header, index) =>
    Math.max(
      header.length,
      ...rows.map((row) => row[index]?.length ?? header.length),
    ),
  );
  const renderRow = (row: string[]): string =>
    row
      .map((cell, index) => cell.padEnd(widths[index] ?? cell.length))
      .join("  ")
      .trimEnd();

  return [renderRow(headers), ...rows.map(renderRow)].join("\n");
};

export const renderInstalledTools = async (
  paths: ShimPaths,
): Promise<string> => {
  const registry = await loadRegistry(paths);
  const tools = Object.values(registry.tools).toSorted((left, right) =>
    left.packageName.localeCompare(right.packageName),
  );

  if (isEmptyArray(tools)) {
    return "No tools installed.";
  }

  const rows = tools.map((tool) => [
    tool.packageName,
    tool.packageVersion,
    `${tool.runtime.kind} ${tool.runtime.version}`,
    tool.bins.join(", "),
  ]);

  return renderTable(["Package", "Version", "Runtime", "Bins"], rows);
};

export const registerListCommand = (program: Command): void => {
  program
    .command("list")
    .description("list installed tools")
    .action(async (): Promise<void> => {
      writeOut(await renderInstalledTools(getShimPaths()));
    });
};
