import path from "node:path";

export interface ModelGatewayConfig {
  providerName: string;
  baseURL: string;
  apiKey: string;
  modelId: string;
  supportsStructuredOutputs: boolean;
}

export interface ServerConfig {
  host: string;
  port: number;
  /** Service version exposed by /health. Never includes secrets. */
  version: string;
  dbPath: string;
  migrationsDirectory: string;
  dbBusyTimeoutMs: number;
  /** Server-only model gateway config. Never exposed by /health or to VITE_*. */
  model?: ModelGatewayConfig;
}

export function loadServerConfig(
  env: NodeJS.ProcessEnv = process.env,
): ServerConfig {
  const rawPort = env.PORT?.trim();
  const port = rawPort ? Number(rawPort) : 8787;
  const host = env.HOST?.trim() || "127.0.0.1";
  const version = env.APP_VERSION?.trim() || "0.1.0";
  const dbPath = env.MANDONG_DB_PATH?.trim() || "/var/lib/mandong/mandong.sqlite3";
  const migrationsDirectory = env.MANDONG_MIGRATIONS_DIR?.trim() || path.resolve("migrations");
  const rawBusyTimeout = env.MANDONG_DB_BUSY_TIMEOUT_MS?.trim();
  const dbBusyTimeoutMs = rawBusyTimeout ? Number(rawBusyTimeout) : 1_000;

  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error("Invalid PORT: expected an integer between 1 and 65535.");
  }
  if (/\s/.test(host)) throw new Error("Invalid HOST.");
  if (!/^[A-Za-z0-9._+-]{1,128}$/.test(version)) throw new Error("Invalid APP_VERSION.");
  if (!path.isAbsolute(dbPath)) throw new Error("Invalid MANDONG_DB_PATH: expected an absolute path.");
  if (!path.isAbsolute(migrationsDirectory)) {
    throw new Error("Invalid MANDONG_MIGRATIONS_DIR: expected an absolute path.");
  }
  if (!Number.isInteger(dbBusyTimeoutMs) || dbBusyTimeoutMs < 0 || dbBusyTimeoutMs > 60_000) {
    throw new Error("Invalid MANDONG_DB_BUSY_TIMEOUT_MS.");
  }

  const model = loadModelConfig(env);

  return {
    host,
    port,
    version,
    dbPath,
    migrationsDirectory,
    dbBusyTimeoutMs,
    ...(model ? { model } : {}),
  };
}

/**
 * Reads the server-only model gateway configuration. Returns undefined when the
 * required MODEL_* variables are absent so the runtime falls back to fixtures.
 * These values must never enter VITE_*, the browser bundle, logs, or /health.
 */
function loadModelConfig(env: NodeJS.ProcessEnv): ModelGatewayConfig | undefined {
  const baseURL = env.MODEL_BASE_URL?.trim();
  const apiKey = env.MODEL_API_KEY?.trim();
  const modelId = env.MODEL_ID?.trim();
  if (!baseURL && !apiKey && !modelId) return undefined;
  if (!baseURL || !apiKey || !modelId) {
    throw new Error("Incomplete model config: MODEL_BASE_URL, MODEL_API_KEY and MODEL_ID are all required.");
  }
  try {
    const url = new URL(baseURL);
    const secure =
      url.protocol === "https:" || url.hostname === "localhost" || url.hostname === "127.0.0.1";
    if (!secure) throw new Error("insecure");
  } catch {
    throw new Error("Invalid MODEL_BASE_URL: expected an https URL or localhost.");
  }
  const providerName = env.MODEL_PROVIDER_NAME?.trim() || "model-gateway";
  const supportsStructuredOutputs = env.MODEL_SUPPORTS_STRUCTURED_OUTPUTS?.trim() !== "false";
  return { providerName, baseURL, apiKey, modelId, supportsStructuredOutputs };
}
