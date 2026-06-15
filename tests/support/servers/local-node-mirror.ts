export type LocalNodeMirror = {
  url: string;
  setVersions: (versions: string[]) => void;
  stop: () => Promise<void>;
};

type LocalNodeMirrorInput = {
  versions: string[];
};

const toNodeRelease = (version: string): { version: string; lts: string } => ({
  version: `v${version}`,
  lts: "TestLts",
});

export const startLocalNodeMirror = ({
  versions,
}: LocalNodeMirrorInput): LocalNodeMirror => {
  let currentVersions = versions;
  const server = Bun.serve({
    port: 0,
    fetch: (request) => {
      const url = new URL(request.url);

      if (url.pathname === "/index.json") {
        return Response.json(currentVersions.map(toNodeRelease));
      }

      return new Response("not found", { status: 404 });
    },
  });

  return {
    url: server.url.toString().replace(/\/$/u, ""),
    setVersions: (nextVersions) => {
      currentVersions = nextVersions;
    },
    stop: async () => {
      await server.stop(true);
    },
  };
};
