export type MaliciousVersionRegistry = {
  url: string;
  stop: () => Promise<void>;
};

export const startMaliciousVersionRegistry = (): MaliciousVersionRegistry => {
  let registryUrl = "";
  const server = Bun.serve({
    port: 0,
    fetch: (request) => {
      const url = new URL(request.url);

      if (url.pathname === "/evil-version") {
        return Response.json({
          name: "evil-version",
          "dist-tags": { latest: "../../bin" },
          versions: {
            "../../bin": {
              name: "evil-version",
              version: "../../bin",
              dist: {
                tarball: `${registryUrl}/evil-version/-/evil-version-evil.tgz`,
              },
            },
          },
        });
      }

      return new Response("not found", { status: 404 });
    },
  });

  registryUrl = server.url.toString().replace(/\/$/u, "");

  return {
    url: registryUrl,
    stop: async () => {
      await server.stop(true);
    },
  };
};
