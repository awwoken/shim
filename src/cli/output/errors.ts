import { colorError, colorHint } from "@/cli/output/colors";
import { AppError } from "@/support/errors";

export const formatCliError = (error: unknown): string => {
  if (error instanceof AppError) {
    if (error.hint === undefined) {
      return `${colorError("Error")} ${error.message}`;
    }

    return `${colorError("Error")} ${error.message}\n${colorHint("Hint")} ${error.hint}`;
  }

  if (error instanceof Error) {
    return `${colorError("Error")} ${error.message}`;
  }

  return `${colorError("Error")} unknown failure`;
};
