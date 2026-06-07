import pc from "picocolors";

export const colorError = (value: string): string => pc.red(value);

export const colorHint = (value: string): string => pc.dim(value);

export const colorProgress = (value: string): string => pc.dim(value);

export const colorSuccess = (value: string): string => pc.green(value);

export const colorWarning = (value: string): string => pc.yellow(value);
