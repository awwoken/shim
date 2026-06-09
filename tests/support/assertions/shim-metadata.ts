import { expect } from "bun:test";
import { join } from "node:path";

import { readJsonFile } from "../filesystem/test-home";

type ShimMetadata = {
  bins: Record<string, { type: string }>;
};

export const expectShimType = async ({
  homeRoot,
  packageName,
  bin,
  type,
}: {
  homeRoot: string;
  packageName: string;
  bin: string;
  type: string;
}): Promise<void> => {
  const metadata = await readJsonFile<ShimMetadata>(
    join(homeRoot, "tools", "npm", packageName, "1.0.0", "shim.json"),
  );

  expect(metadata.bins[bin]?.type).toBe(type);
};
