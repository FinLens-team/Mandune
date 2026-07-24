import { serve, type ServerType } from "@hono/node-server";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createApp } from "./app.js";
import { loadServerConfig } from "./config.js";

/**
 * Node must not truncate the accepted 180s application deadline. Deployment
 * proxy timeouts remain a separate decision in #35.
 */
const ANALYSIS_DEADLINE_MS = 180_000;
const REQUEST_TIMEOUT_MS = 0;
const HEADERS_TIMEOUT_MS = ANALYSIS_DEADLINE_MS + 30_000;

function applyServerTimeouts(server: ServerType): void {
  // Hono's ServerType also covers HTTP/2, while this Node adapter starts HTTP/1.
  const httpServer = server as import("node:http").Server;
  httpServer.requestTimeout = REQUEST_TIMEOUT_MS;
  httpServer.headersTimeout = HEADERS_TIMEOUT_MS;
}

export function startServer(
  env: NodeJS.ProcessEnv = process.env,
): { server: ServerType; port: number } {
  const config = loadServerConfig(env);
  const app = createApp(config);

  const server = serve(
    {
      fetch: app.fetch,
      port: config.port,
      hostname: "0.0.0.0",
    },
    (info) => {
      console.log(
        `mandong listening on http://127.0.0.1:${info.port} (request timeout disabled; headers timeout ${HEADERS_TIMEOUT_MS}ms)`,
      );
    },
  );

  applyServerTimeouts(server);
  return { server, port: config.port };
}

const entryPoint = process.argv[1]
  ? path.resolve(process.argv[1])
  : undefined;

if (entryPoint === fileURLToPath(import.meta.url)) {
  startServer();
}
