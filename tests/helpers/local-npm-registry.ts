import { createHash, randomUUID } from "node:crypto";
import { chmod, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";

import { writeJsonFile } from "./test-home";

const EXECUTABLE_FILE_MODE = 0o755;
const EXIT_SUCCESS = 0;

type PackageBin = {
  name: string;
  path?: string;
  shebang?: string;
  body?: string;
};

type PackageFile = {
  path: string;
  content: string;
};

export type RegistryPackage = {
  name: string;
  version: string;
  bins: PackageBin[];
  enginesNode?: string;
  metadataName?: string;
  scripts?: Record<string, string>;
  files?: PackageFile[];
};

type PreparedPackage = RegistryPackage & {
  tarballPath?: string;
  shasum?: string;
};

export type LocalNpmRegistry = {
  url: string;
  stop: () => Promise<void>;
};

type LocalNpmRegistryInput = {
  packages: RegistryPackage[];
};

const packageTarballName = ({ name, version }: RegistryPackage): string =>
  `${name.replaceAll("/", "-")}-${version}.tgz`;

const defaultBinBody = (name: string, version: string): string =>
  `const { writeFileSync } = require("node:fs");\nif (process.env.SHIM_TEST_PROBE !== undefined) {\n  writeFileSync(process.env.SHIM_TEST_PROBE, process.env.PATH ?? "");\n}\nprocess.stdout.write(${JSON.stringify(`${name}@${version}\n`)});\n`;

const binPath = (bin: PackageBin): string => bin.path ?? `bin/${bin.name}.js`;

const packageJsonFor = (fixture: RegistryPackage): Record<string, unknown> => {
  const binEntries = Object.fromEntries(
    fixture.bins.map((bin) => [bin.name, binPath(bin)]),
  );

  return {
    name: fixture.metadataName ?? fixture.name,
    version: fixture.version,
    type: "commonjs",
    bin: binEntries,
    engines:
      fixture.enginesNode === undefined
        ? undefined
        : { node: fixture.enginesNode },
    scripts: fixture.scripts,
  };
};

const runTar = async (archivePath: string, cwd: string): Promise<void> => {
  const child = Bun.spawn(["tar", "-czf", archivePath, "package"], {
    cwd,
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stderr, exitCode] = await Promise.all([
    child.stderr.text(),
    child.exited,
  ]);

  if (exitCode === EXIT_SUCCESS) {
    return;
  }

  throw new Error(`Could not create fixture tarball: ${stderr}`);
};

const fileSha1 = async (path: string): Promise<string> => {
  const content = Buffer.from(await Bun.file(path).arrayBuffer());

  return createHash("sha1").update(content).digest("hex");
};

const preparePackage = async (
  root: string,
  fixture: RegistryPackage,
): Promise<PreparedPackage> => {
  const stagePath = join(root, `${fixture.name}-${fixture.version}`, "package");
  const archivePath = join(root, packageTarballName(fixture));

  await mkdir(stagePath, { recursive: true });
  await writeJsonFile(join(stagePath, "package.json"), packageJsonFor(fixture));

  for (const bin of fixture.bins) {
    const path = join(stagePath, binPath(bin));
    const body = bin.body ?? defaultBinBody(bin.name, fixture.version);

    await mkdir(dirname(path), { recursive: true });
    await Bun.write(path, `${bin.shebang ?? "#!/usr/bin/env node"}\n${body}`);
    await chmod(path, EXECUTABLE_FILE_MODE);
  }

  for (const file of fixture.files ?? []) {
    const path = join(stagePath, file.path);

    await mkdir(dirname(path), { recursive: true });
    await Bun.write(path, file.content);
  }

  await runTar(archivePath, join(stagePath, ".."));

  return {
    ...fixture,
    tarballPath: archivePath,
    shasum: await fileSha1(archivePath),
  };
};

const metadataFor = (
  registryUrl: string,
  packages: PreparedPackage[],
): Response => {
  const [firstPackage] = packages;

  if (firstPackage === undefined) {
    return new Response("not found", { status: 404 });
  }

  const versions = Object.fromEntries(
    packages.map((fixture) => [
      fixture.version,
      {
        name: fixture.metadataName ?? fixture.name,
        version: fixture.version,
        bin: Object.fromEntries(
          fixture.bins.map((bin) => [bin.name, binPath(bin)]),
        ),
        engines:
          fixture.enginesNode === undefined
            ? undefined
            : { node: fixture.enginesNode },
        scripts: fixture.scripts,
        dist: {
          tarball: `${registryUrl}/${fixture.name}/-/${packageTarballName(fixture)}`,
          shasum: fixture.shasum,
        },
      },
    ]),
  );
  const [latestPackage] = packages
    .toSorted((left, right) => left.version.localeCompare(right.version))
    .toReversed();

  return Response.json({
    name: firstPackage.name,
    "dist-tags": { latest: latestPackage?.version },
    versions,
  });
};

const serveTarball = (
  packages: PreparedPackage[],
  fileName: string,
): Response => {
  const fixture = packages.find(
    (candidate) => packageTarballName(candidate) === fileName,
  );

  if (fixture?.tarballPath === undefined) {
    return new Response("not found", { status: 404 });
  }

  return new Response(Bun.file(fixture.tarballPath), {
    headers: { "Content-Type": "application/octet-stream" },
  });
};

const trimLeadingSlash = (value: string): string => value.replace(/^\//u, "");

export const startLocalNpmRegistry = async ({
  packages,
}: LocalNpmRegistryInput): Promise<LocalNpmRegistry> => {
  const root = join(tmpdir(), `shim-registry-${randomUUID()}`);

  await mkdir(root, { recursive: true });

  const prepared = await Promise.all(
    packages.map(async (fixture) => await preparePackage(root, fixture)),
  );
  const byName = new Map<string, PreparedPackage[]>();

  for (const fixture of prepared) {
    byName.set(fixture.name, [...(byName.get(fixture.name) ?? []), fixture]);
  }
  let registryUrl = "";
  const server = Bun.serve({
    port: 0,
    fetch: (request) => {
      const url = new URL(request.url);
      const path = trimLeadingSlash(decodeURIComponent(url.pathname));

      if (path.includes("/-/")) {
        return serveTarball(prepared, basename(path));
      }

      return metadataFor(registryUrl, byName.get(path) ?? []);
    },
  });

  registryUrl = server.url.toString().replace(/\/$/u, "");

  return {
    url: registryUrl,
    stop: async () => {
      await server.stop(true);
      await rm(root, { force: true, recursive: true });
    },
  };
};
