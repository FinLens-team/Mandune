import path from "node:path";
import { A2A_DEEP_REVIEW_MODEL_ID } from "../a2a/types.js";

const ARK_OPENAI_COMPATIBLE_BASE_URL = "https://ark.cn-beijing.volces.com/api/v3";

export interface ModelGatewayConfig {
  providerName: string;
  baseURL: string;
  apiKey: string;
  modelId: string;
  supportsStructuredOutputs: boolean;
}

export interface A2ADeepAgentConfig {
  baseURL: string;
  apiKey: string;
  modelId: typeof A2A_DEEP_REVIEW_MODEL_ID;
  bearerToken: string;
  publicBaseUrl?: string;
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
  /** Optional server-only Bocha credential. Never exposed by /health. */
  bochaApiKey?: string;
  /** Python 3.12 executable used only by the isolated PandaAI batch worker. */
  pandaPythonExecutable: string;
  /** Independent A2A DeepSeek-Pro-on-Ark agent config. Secrets never enter Card or responses. */
  a2a?: A2ADeepAgentConfig;
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
  const bochaApiKey = env.BOCHA_API_KEY?.trim();
  const pandaPythonExecutable = env.PANDA_PYTHON_EXECUTABLE?.trim() || "python3.12";
  const a2a = loadA2AConfig(env);
  if (/\r|\n|\0/u.test(pandaPythonExecutable)) {
    throw new Error("Invalid PANDA_PYTHON_EXECUTABLE.");
  }

  return {
    host,
    port,
    version,
    dbPath,
    migrationsDirectory,
    dbBusyTimeoutMs,
    pandaPythonExecutable,
    ...(model ? { model } : {}),
    ...(bochaApiKey ? { bochaApiKey } : {}),
    ...(a2a ? { a2a } : {}),
  };
}

function loadA2AConfig(env: NodeJS.ProcessEnv): A2ADeepAgentConfig | undefined {
  const apiKey = env.ARK_API_KEY?.trim();
  const bearerToken = env.A2A_BEARER_TOKEN?.trim();
  const configuredBaseUrl = env.ARK_BASE_URL?.trim();
  const configuredPublicBaseUrl = env.A2A_PUBLIC_BASE_URL?.trim();
  const anyConfigured = Boolean(
    apiKey || bearerToken || configuredBaseUrl || configuredPublicBaseUrl,
  );
  if (!anyConfigured) return undefined;
  if (!apiKey || !bearerToken) {
    throw new Error("Incomplete A2A config: ARK_API_KEY and A2A_BEARER_TOKEN are required.");
  }
  if (bearerToken.length < 24 || /[\r\n]/u.test(bearerToken)) {
    throw new Error("Invalid A2A_BEARER_TOKEN: expected at least 24 characters without newlines.");
  }

  const baseURL = configuredBaseUrl || ARK_OPENAI_COMPATIBLE_BASE_URL;
  try {
    const url = new URL(baseURL);
    const secure =
      url.protocol === "https:" || url.hostname === "localhost" || url.hostname === "127.0.0.1";
    if (!secure || url.username || url.password) throw new Error("unsafe");
  } catch {
    throw new Error("Invalid ARK_BASE_URL: expected an HTTPS URL or localhost.");
  }

  let publicBaseUrl: string | undefined;
  if (configuredPublicBaseUrl) {
    try {
      const url = new URL(configuredPublicBaseUrl);
      const secure =
        url.protocol === "https:" || url.hostname === "localhost" || url.hostname === "127.0.0.1";
      if (!secure || url.username || url.password || url.pathname !== "/") throw new Error("unsafe");
      publicBaseUrl = url.origin;
    } catch {
      throw new Error("Invalid A2A_PUBLIC_BASE_URL: expected an HTTPS origin or localhost origin.");
    }
  }

  return {
    baseURL,
    apiKey,
    modelId: A2A_DEEP_REVIEW_MODEL_ID,
    bearerToken,
    ...(publicBaseUrl ? { publicBaseUrl } : {}),
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
  if (modelId !== "step-explore") {
    throw new Error("Invalid MODEL_ID: daily review V2 only permits step-explore.");
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
  const supportsStructuredOutputs = env.MODEL_SUPPORTS_STRUCTURED_OUTPUTS?.trim() === "true";
  return { providerName, baseURL, apiKey, modelId, supportsStructuredOutputs };
}
