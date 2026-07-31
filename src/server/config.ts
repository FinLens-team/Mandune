import path from "node:path";
import { A2A_DEEP_REVIEW_MODEL_ID } from "../a2a/types.js";
import { DEVELOPMENT_WORKSPACE_COOKIE, WORKSPACE_COOKIE } from "../workspace/index.js";

const ARK_OPENAI_COMPATIBLE_BASE_URL = "https://ark.cn-beijing.volces.com/api/v3";

/** Wire protocol of the configured model endpoint. */
export type ModelProtocol = "openai" | "anthropic_messages";

export interface ModelGatewayConfig {
  providerName: string;
  baseURL: string;
  apiKey: string;
  modelId: string;
  supportsStructuredOutputs: boolean;
  /** openai = Chat Completions; anthropic_messages = /messages (e.g. step-explore). */
  protocol: ModelProtocol;
}

export interface A2ADeepAgentConfig {
  baseURL: string;
  apiKey: string;
  modelId: typeof A2A_DEEP_REVIEW_MODEL_ID;
  bearerToken: string;
  publicBaseUrl?: string;
}

/**
 * stream: 放宽模式，真实行情（免鉴权公开源）+ 模型流式自由文本，只需 MODEL_*。
 * v2: 严格每日复盘 V2 管线，需要 PandaAI Python worker 与 Bocha 凭据。
 */
export type AnalysisMode = "stream" | "v2";

export interface ServerConfig {
  host: string;
  port: number;
  /** Service version exposed by /health. Never includes secrets. */
  version: string;
  dbPath: string;
  migrationsDirectory: string;
  dbBusyTimeoutMs: number;
  workspaceCookie: { name: string; secure: boolean };
  /** Executor selection when a model is configured. Defaults to stream. */
  analysisMode: AnalysisMode;
  /** Overall per-analysis hard deadline in ms. Demo may relax beyond 180s. */
  analysisDeadlineMs: number;
  /** Server-only model gateway config. Never exposed by /health or to VITE_*. */
  model?: ModelGatewayConfig;
  /** Ordered fallback gateways tried when the primary model fails. */
  modelFallbacks: ModelGatewayConfig[];
  /** Optional server-only Bocha credential. Never exposed by /health. */
  bochaApiKey?: string;
  /** Python 3.12 executable used only by the isolated PandaAI batch worker. */
  pandaPythonExecutable: string;
  /** Isolated Python executable containing AKShare. */
  aksharePythonExecutable: string;
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
  const production = env.NODE_ENV === "production";

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
  if (production && !model) {
    throw new Error(
      "Production model configuration required: MODEL_BASE_URL, MODEL_API_KEY and MODEL_ID.",
    );
  }
  const analysisMode = loadAnalysisMode(env);
  const rawDeadline = env.MANDONG_ANALYSIS_DEADLINE_MS?.trim();
  const analysisDeadlineMs = rawDeadline ? Number(rawDeadline) : 180_000;
  if (!Number.isInteger(analysisDeadlineMs) || analysisDeadlineMs < 10_000 || analysisDeadlineMs > 3_600_000) {
    throw new Error("Invalid MANDONG_ANALYSIS_DEADLINE_MS: expected 10000..3600000.");
  }
  const modelFallbacks = model ? loadModelFallbacks(env) : [];
  const bochaApiKey = env.BOCHA_API_KEY?.trim();
  const pandaPythonExecutable = env.PANDA_PYTHON_EXECUTABLE?.trim() || "python3.12";
  const aksharePythonExecutable = env.AKSHARE_PYTHON_EXECUTABLE?.trim() ||
    "/home/evil/.local/share/mandune-dev/akshare-venv/bin/python";
  const a2a = loadA2AConfig(env);
  if (/\r|\n|\0/u.test(pandaPythonExecutable)) {
    throw new Error("Invalid PANDA_PYTHON_EXECUTABLE.");
  }
  if (/\r|\n|\0/u.test(aksharePythonExecutable)) {
    throw new Error("Invalid AKSHARE_PYTHON_EXECUTABLE.");
  }

  return {
    host,
    port,
    version,
    dbPath,
    migrationsDirectory,
    dbBusyTimeoutMs,
    workspaceCookie: production
      ? { name: WORKSPACE_COOKIE, secure: true }
      : { name: DEVELOPMENT_WORKSPACE_COOKIE, secure: false },
    analysisMode,
    analysisDeadlineMs,
    modelFallbacks,
    pandaPythonExecutable,
    aksharePythonExecutable,
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

function loadAnalysisMode(env: NodeJS.ProcessEnv): AnalysisMode {
  const raw = env.MANDONG_ANALYSIS_MODE?.trim();
  if (!raw || raw === "stream") return "stream";
  if (raw === "v2") return "v2";
  throw new Error("Invalid MANDONG_ANALYSIS_MODE: expected stream or v2.");
}

/**
 * Reads the server-only model gateway configuration. Returns undefined when the
 * required MODEL_* variables are absent so local/test runtimes can use the
 * deterministic fixture executor. Production rejects this absence before
 * opening storage or binding a port. These values must never enter VITE_*,
 * the browser bundle, logs, or /health.
 */
function loadModelConfig(env: NodeJS.ProcessEnv): ModelGatewayConfig | undefined {
  return loadModelConfigWithPrefix(env, "MODEL_");
}

/**
 * Reads ordered fallback gateways from MODEL_FALLBACK_1_*, MODEL_FALLBACK_2_*, …
 * The chain stops at the first index whose variables are entirely absent.
 */
function loadModelFallbacks(env: NodeJS.ProcessEnv): ModelGatewayConfig[] {
  const fallbacks: ModelGatewayConfig[] = [];
  for (let index = 1; index <= 8; index += 1) {
    const config = loadModelConfigWithPrefix(env, `MODEL_FALLBACK_${index}_`);
    if (!config) break;
    fallbacks.push(config);
  }
  return fallbacks;
}

function loadModelConfigWithPrefix(
  env: NodeJS.ProcessEnv,
  prefix: string,
): ModelGatewayConfig | undefined {
  const baseURL = env[`${prefix}BASE_URL`]?.trim();
  const apiKey = env[`${prefix}API_KEY`]?.trim();
  const modelId = env[`${prefix}ID`]?.trim();
  if (!baseURL && !apiKey && !modelId) return undefined;
  if (!baseURL || !apiKey || !modelId) {
    throw new Error(`Incomplete model config: ${prefix}BASE_URL, ${prefix}API_KEY and ${prefix}ID are all required.`);
  }
  if (/[\r\n\0\s]/u.test(modelId)) {
    throw new Error(`Invalid ${prefix}ID: expected a single token without whitespace.`);
  }
  try {
    const url = new URL(baseURL);
    const secure =
      url.protocol === "https:" || url.hostname === "localhost" || url.hostname === "127.0.0.1";
    if (!secure) throw new Error("insecure");
  } catch {
    throw new Error(`Invalid ${prefix}BASE_URL: expected an https URL or localhost.`);
  }
  const providerName = env[`${prefix}PROVIDER_NAME`]?.trim() || "model-gateway";
  const supportsStructuredOutputs = env[`${prefix}SUPPORTS_STRUCTURED_OUTPUTS`]?.trim() === "true";
  const rawProtocol = env[`${prefix}PROTOCOL`]?.trim();
  if (rawProtocol && rawProtocol !== "openai" && rawProtocol !== "anthropic_messages") {
    throw new Error(`Invalid ${prefix}PROTOCOL: expected openai or anthropic_messages.`);
  }
  const protocol: ModelProtocol = rawProtocol === "anthropic_messages" ? "anthropic_messages" : "openai";
  return { providerName, baseURL, apiKey, modelId, supportsStructuredOutputs, protocol };
}
