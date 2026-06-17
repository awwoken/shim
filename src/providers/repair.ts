import type { ProviderId } from "@/core/models";
import type { ShimRepairer } from "@/core/repair";
import { NPM_PROVIDER_ID } from "@/providers/npm/constants";
import { repairNpmShim } from "@/providers/npm/repair";

export const providerShimRepairers: Record<ProviderId, ShimRepairer> = {
  [NPM_PROVIDER_ID]: repairNpmShim,
};
