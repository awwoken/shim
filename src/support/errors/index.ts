export class AppError extends Error {
  public readonly hint: string | undefined;

  public constructor(message: string, hint?: string) {
    super(message);
    this.name = "AppError";
    this.hint = hint;
  }
}

export const toErrorMessage = (error: unknown): string => {
  if (error instanceof AppError) {
    if (error.hint === undefined) {
      return `Error ${error.message}`;
    }

    return `Error ${error.message}\nHint ${error.hint}`;
  }

  if (error instanceof Error) {
    return `Error ${error.message}`;
  }

  return "Error unknown failure";
};
