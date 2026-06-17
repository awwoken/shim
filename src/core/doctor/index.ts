import type { RegistryTool, ShimMetadata } from "@/core/models";
import { assertDirectory } from "@/support/fs";
import type { ShimPaths } from "@/support/paths";

export type DoctorReport = {
  ok: boolean;
  text: string;
};

export type DoctorCheck = {
  level: "ok" | "warn" | "error";
  message: string;
  hint?: string;
};

export type ToolDoctorInput = {
  paths: ShimPaths;
  tool: RegistryTool;
  metadata: ShimMetadata;
  checks: DoctorCheck[];
};

export type ToolDoctor = (input: ToolDoctorInput) => Promise<void>;

export type ShimDoctorInput = ToolDoctorInput & {
  binName: string;
};

export type ShimDoctor = (input: ShimDoctorInput) => Promise<void>;

type CheckDirectoryInput = {
  checks: DoctorCheck[];
  path: string;
  message: string;
  hint?: string;
};

export const checkDirectory = async ({
  checks,
  path,
  message,
  hint,
}: CheckDirectoryInput): Promise<void> => {
  const exists = await assertDirectory(path);

  checks.push({
    level: exists ? "ok" : "error",
    message: `${message} ${path}`,
    hint: exists ? undefined : hint,
  });
};
