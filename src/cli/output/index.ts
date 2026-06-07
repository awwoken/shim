type WriteOutOptions = {
  leadingBlankLine?: boolean;
  trailingBlankLine?: boolean;
};

export const writeOut = (
  message: string,
  options: WriteOutOptions = {},
): void => {
  if (options.leadingBlankLine === true) {
    process.stdout.write("\n");
  }

  process.stdout.write(`${message}\n`);

  if (options.trailingBlankLine === true) {
    process.stdout.write("\n");
  }
};

export const writeErr = (message: string): void => {
  process.stderr.write(`${message}\n`);
};
