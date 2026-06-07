import type { ToolDoctor } from "@/core/doctor";
import type { ProviderId } from "@/core/models";
import { NPM_PROVIDER_ID } from "@/providers/npm/constants";
import { checkNpmTool } from "@/providers/npm/doctor";

export const providerDoctors: Record<ProviderId, ToolDoctor> = {
  [NPM_PROVIDER_ID]: checkNpmTool,
};
