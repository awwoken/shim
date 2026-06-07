import type { ToolDoctor } from "@/core/doctor";
import type { RuntimeKind } from "@/core/models";
import { NODE_RUNTIME_ID } from "@/runtimes/node/constants";
import { checkNodeRuntime } from "@/runtimes/node/doctor";

export const runtimeDoctors: Record<RuntimeKind, ToolDoctor> = {
  [NODE_RUNTIME_ID]: checkNodeRuntime,
};
