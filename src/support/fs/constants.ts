export const EXECUTABLE_FILE_MODE = 0o755;
export const JSON_INDENT_SPACES = 2;

export const EXPECTED_FS_PROBE_ERROR_CODES = new Set([
  "EACCES",
  "EISDIR",
  "ENOENT",
  "ENOTDIR",
  "EPERM",
]);
