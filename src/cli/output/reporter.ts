import { writeOut } from "@/cli/output";
import { colorProgress } from "@/cli/output/colors";
import type { Reporter } from "@/core/reporter";

export const createCliReporter = (): Reporter => ({
  info: (message: string): void => {
    if (message === "") {
      writeOut(message);

      return;
    }

    writeOut(colorProgress(message));
  },
});
