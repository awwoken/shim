import { expect } from "bun:test";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";

const SENTINEL_CONTENT = "sentinel\n";

export const writeSentinel = async (homeRoot: string): Promise<void> => {
  await mkdir(join(homeRoot, "bin"), { recursive: true });
  await Bun.write(join(homeRoot, "bin", "sentinel"), SENTINEL_CONTENT);
};

export const expectSentinel = async (homeRoot: string): Promise<void> => {
  expect(await Bun.file(join(homeRoot, "bin", "sentinel")).text()).toBe(
    SENTINEL_CONTENT,
  );
};
