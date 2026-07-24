export type JsonSchema = Readonly<Record<string, unknown>>;

export interface ModelGatewayRequest {
  operation: string;
  schemaVersion: string;
  schema: JsonSchema;
  instructions: string;
  input: unknown;
  signal: AbortSignal;
  timeoutMs: number;
}

export type ModelGatewayFailureCode =
  | "cancelled"
  | "timeout"
  | "configuration_unavailable"
  | "privacy_violation"
  | "malformed_output"
  | "provider_failure";

export type ModelGatewayResult<T> =
  | { ok: true; value: T }
  | { ok: false; code: ModelGatewayFailureCode; retryable: boolean };

/** Framework-neutral boundary. Each call is exactly one provider attempt. */
export interface ModelGateway {
  generate<T>(request: ModelGatewayRequest): Promise<ModelGatewayResult<T>>;
}
