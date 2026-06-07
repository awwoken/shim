import type { Registry, ToolId } from "@/core/models";
import { REGISTRY_SCHEMA_VERSION } from "@/core/registry/constants";
import * as v from "valibot";

const isToolId = (value: unknown): value is ToolId =>
  typeof value === "string" && value.includes(":");

const toolIdSchema = v.custom<ToolId>(
  isToolId,
  "Expected provider-prefixed tool id",
);

const runtimeRefSchema = v.strictObject({
  kind: v.string(),
  version: v.string(),
});

const registryToolSchema = v.strictObject({
  id: toolIdSchema,
  provider: v.string(),
  packageName: v.string(),
  packageVersion: v.string(),
  packageSpec: v.string(),
  runtime: runtimeRefSchema,
  installedAt: v.string(),
  toolPath: v.string(),
  metadataPath: v.string(),
  bins: v.array(v.string()),
});

const registryBinSchema = v.strictObject({
  provider: v.string(),
  toolId: toolIdSchema,
  packageName: v.string(),
  packageVersion: v.string(),
  shimPath: v.string(),
});

export const registrySchema: v.GenericSchema<unknown, Registry> =
  v.strictObject({
    version: v.literal(REGISTRY_SCHEMA_VERSION),
    tools: v.record(v.string(), registryToolSchema),
    bins: v.record(v.string(), registryBinSchema),
  });
