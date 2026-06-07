import { EXPECTED_FS_PROBE_ERROR_CODES } from "@/support/fs/constants";

type NodeError = Error & {
  code?: string;
};

const isNodeError = (error: unknown): error is NodeError =>
  error instanceof Error;

export const isExpectedFsProbeError = (error: unknown): boolean => {
  if (!isNodeError(error)) {
    return false;
  }

  return (
    error.code !== undefined && EXPECTED_FS_PROBE_ERROR_CODES.has(error.code)
  );
};
