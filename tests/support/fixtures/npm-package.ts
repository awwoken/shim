import type { RegistryPackage } from "../servers/local-npm-registry";

export type NpmPackageFixture = RegistryPackage;

export const npmPackage = (
  name: string,
  version: string,
): NpmPackageFixture => ({
  name,
  version,
  bins: [{ name }],
});

export const npmPackageWithBins = (
  name: string,
  version: string,
  bins: string[],
): NpmPackageFixture => ({
  name,
  version,
  bins: bins.map((bin) => ({ name: bin })),
});
