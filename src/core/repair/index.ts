import type { RegistryTool, ShimMetadata } from "@/core/models";
import type { ShimPaths } from "@/support/paths";

export type RepairStatus = "ok" | "repaired" | "skipped";

export type RepairResult = {
  status: RepairStatus;
  message: string;
  hint?: string;
};

export type ShimRepairInput = {
  paths: ShimPaths;
  tool: RegistryTool;
  metadata: ShimMetadata;
  binName: string;
};

export type ShimRepairer = (input: ShimRepairInput) => Promise<RepairResult>;
