export type JsonSchema = Readonly<Record<string, unknown>>;

export interface ModelGatewayRequest {
  operation: string;
  schemaVersion: string;
  schema: JsonSchema;
  instructions: string;
  input: unknown;
  signal: AbortSignal;
  timeoutMs: number;
  temperature?: number;
  maxOutputTokens?: number;
}

export type ModelGatewayFailureCode =
  | "cancelled"
  | "timeout"
  | "configuration_unavailable"
  | "privacy_violation"
  | "malformed_output"
  | "provider_failure";

export type ModelGatewayResult<T> =
  | { ok: true; value: T; finishReason?: string }
  | { ok: false; code: ModelGatewayFailureCode; retryable: boolean };

/**
 * Relaxed streaming request (Demo mode). The model returns free-form text with
 * no versioned schema, evidence-reference or content-boundary validation. Each
 * incremental delta is delivered through onText so the client can render while
 * the model is still generating.
 */
export interface ModelStreamRequest {
  instructions: string;
  prompt: string;
  signal: AbortSignal;
  timeoutMs: number;
  maxOutputTokens?: number;
  onConnected?: () => void;
  /** Signals that private model reasoning has started; no reasoning text crosses this boundary. */
  onReasoningStarted?: () => void;
  onText: (delta: string) => void;
}

export type ModelStreamResult =
  | { ok: true; text: string }
  | { ok: false; code: ModelGatewayFailureCode; retryable: boolean };

/** Framework-neutral boundary. Each call is exactly one provider attempt. */
export interface ModelGateway {
  generate<T>(request: ModelGatewayRequest): Promise<ModelGatewayResult<T>>;
  /** Optional relaxed streaming path used by the Demo free-text executor. */
  streamGenerate?(request: ModelStreamRequest): Promise<ModelStreamResult>;
}
