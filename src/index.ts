#!/usr/bin/env bun

import { writeErr } from "@/cli/output";
import { formatCliError } from "@/cli/output/errors";
import { createProgram } from "@/cli/program";

try {
  await createProgram().parseAsync();
} catch (error) {
  writeErr(formatCliError(error));
  process.exitCode = 1;
}
