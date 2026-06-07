import { AppError } from "@/support/errors";

export const nodePlatformSlug = (): string => {
  if (process.platform === "darwin" && process.arch === "arm64") {
    return "darwin-arm64";
  }

  if (process.platform === "darwin" && process.arch === "x64") {
    return "darwin-x64";
  }

  if (process.platform === "linux" && process.arch === "x64") {
    return "linux-x64";
  }

  if (process.platform === "linux" && process.arch === "arm64") {
    return "linux-arm64";
  }

  throw new AppError(
    `Unsupported platform ${process.platform}-${process.arch}`,
  );
};

export const nodeArchiveName = (version: string): string => {
  const slug = nodePlatformSlug();
  const extension = process.platform === "darwin" ? "tar.gz" : "tar.xz";

  return `node-v${version}-${slug}.${extension}`;
};
