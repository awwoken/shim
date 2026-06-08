import { createHash, randomUUID } from "node:crypto";
import { chmod, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  findHostCommand,
  findHostNpmCli,
  nodeWrapperSource,
  npmWrapperSource,
} from "./preseed-runtime";

const EXECUTABLE_FILE_MODE = 0o755;
const EXIT_SUCCESS = 0;

type PreparedArchive = {
  archiveName: string;
  archivePath: string;
  hash: string;
};

export type LocalNodeArchiveMirror = {
  url: string;
  archiveName: string;
  stop: () => Promise<void>;
};

type LocalNodeArchiveMirrorInput = {
  version: string;
};

const nodePlatformSlug = (): string => {
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

  throw new Error(`Unsupported platform ${process.platform}-${process.arch}`);
};

const nodeArchiveName = (version: string): string => {
  const extension = process.platform === "darwin" ? "tar.gz" : "tar.xz";

  return `node-v${version}-${nodePlatformSlug()}.${extension}`;
};

const tarArgs = (archivePath: string, rootName: string): string[] => {
  if (process.platform === "darwin") {
    return ["-czf", archivePath, rootName];
  }

  return ["-cJf", archivePath, rootName];
};

const runTar = async (
  archivePath: string,
  cwd: string,
  rootName: string,
): Promise<void> => {
  const child = Bun.spawn(["tar", ...tarArgs(archivePath, rootName)], {
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

  throw new Error(`Could not create fixture Node archive: ${stderr}`);
};

const fileSha256 = async (path: string): Promise<string> => {
  const content = Buffer.from(await Bun.file(path).arrayBuffer());

  return createHash("sha256").update(content).digest("hex");
};

const prepareArchive = async (
  root: string,
  version: string,
): Promise<PreparedArchive> => {
  const rootName = `node-v${version}-${nodePlatformSlug()}`;
  const archiveName = nodeArchiveName(version);
  const archivePath = join(root, archiveName);
  const binPath = join(root, rootName, "bin");
  const hostNode = await findHostCommand("node");
  const hostNpmCli = await findHostNpmCli();

  await mkdir(binPath, { recursive: true });
  await Bun.write(join(binPath, "node"), nodeWrapperSource(hostNode));
  await Bun.write(join(binPath, "npm"), npmWrapperSource(hostNode, hostNpmCli));
  await chmod(join(binPath, "node"), EXECUTABLE_FILE_MODE);
  await chmod(join(binPath, "npm"), EXECUTABLE_FILE_MODE);
  await runTar(archivePath, root, rootName);

  return {
    archiveName,
    archivePath,
    hash: await fileSha256(archivePath),
  };
};

export const startLocalNodeArchiveMirror = async ({
  version,
}: LocalNodeArchiveMirrorInput): Promise<LocalNodeArchiveMirror> => {
  const root = join(tmpdir(), `shim-node-mirror-${randomUUID()}`);

  await mkdir(root, { recursive: true });

  const archive = await prepareArchive(root, version);
  const server = Bun.serve({
    port: 0,
    fetch: (request) => {
      const url = new URL(request.url);

      if (url.pathname === "/index.json") {
        return Response.json([{ version: `v${version}`, lts: "TestLts" }]);
      }

      if (url.pathname === `/v${version}/SHASUMS256.txt`) {
        return new Response(`${archive.hash}  ${archive.archiveName}\n`);
      }

      if (url.pathname === `/v${version}/${archive.archiveName}`) {
        return new Response(Bun.file(archive.archivePath));
      }

      return new Response("not found", { status: 404 });
    },
  });

  return {
    url: server.url.toString().replace(/\/$/u, ""),
    archiveName: archive.archiveName,
    stop: async () => {
      await server.stop(true);
      await rm(root, { force: true, recursive: true });
    },
  };
};
