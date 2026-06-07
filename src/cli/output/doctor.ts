import {
  colorError,
  colorHint,
  colorSuccess,
  colorWarning,
} from "@/cli/output/colors";
import type { DoctorCheck } from "@/core/doctor";

const renderCheckMessage = (check: DoctorCheck): string => {
  if (check.level === "ok") {
    return `${colorSuccess("OK")} ${check.message}`;
  }

  if (check.level === "warn") {
    return `${colorWarning("Warning")} ${check.message}`;
  }

  return `${colorError("Error")} ${check.message}`;
};

export const renderDoctorCheck = (check: DoctorCheck): string => {
  const message = renderCheckMessage(check);

  if (check.hint === undefined) {
    return message;
  }

  return `${message}\n${colorHint("Hint")} ${check.hint}`;
};
