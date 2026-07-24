export interface ServerConfig {
  port: number;
  /** Service version exposed by /health. Never includes secrets. */
  version: string;
}

export function loadServerConfig(
  env: NodeJS.ProcessEnv = process.env,
): ServerConfig {
  const rawPort = env.PORT?.trim();
  const port = rawPort ? Number(rawPort) : 8787;

  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error("Invalid PORT: expected an integer between 1 and 65535.");
  }

  return {
    port,
    version: "0.1.0",
  };
}
