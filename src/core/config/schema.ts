import { NODE_RUNTIME_ID, NPM_PROVIDER_ID } from "@/core/ids";
import * as v from "valibot";

const nodeDefaultPolicySchema = v.literal("latest-lts");

const npmProviderConfigSchema = v.object({
  registry: v.optional(v.string()),
});

const nodeRuntimeConfigSchema = v.object({
  defaultPolicy: v.optional(nodeDefaultPolicySchema),
  bootstrapVersion: v.optional(v.string()),
  mirror: v.optional(v.string()),
});

export const partialShimConfigSchema = v.object({
  providers: v.optional(
    v.object({
      [NPM_PROVIDER_ID]: v.optional(npmProviderConfigSchema),
    }),
  ),
  runtimes: v.optional(
    v.object({
      [NODE_RUNTIME_ID]: v.optional(nodeRuntimeConfigSchema),
    }),
  ),
  defaultNodePolicy: v.optional(nodeDefaultPolicySchema),
  bootstrapNode: v.optional(v.string()),
  registry: v.optional(v.string()),
  nodeMirror: v.optional(v.string()),
});

export type PartialShimConfig = v.InferOutput<typeof partialShimConfigSchema>;
