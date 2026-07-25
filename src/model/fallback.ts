import type {
  ModelGateway,
  ModelGatewayRequest,
  ModelGatewayResult,
  ModelStreamRequest,
  ModelStreamResult,
} from "./gateway.js";

/**
 * Ordered model fallback. Tries each gateway in turn and returns the first
 * successful result; only advances to the next gateway when an attempt fails.
 * Non-retryable failures (privacy_violation, configuration_unavailable) still
 * advance so a bad primary never blocks the demo, but the last failure is
 * surfaced when every gateway is exhausted.
 *
 * Streaming deltas are forwarded so callers can derive non-content progress
 * from headings while a provider is running. The returned text still belongs
 * only to the first successful attempt; callers must not expose raw deltas
 * before validating that final text.
 */
export function createFallbackModelGateway(gateways: readonly ModelGateway[]): ModelGateway {
  const chain = gateways.filter(Boolean);
  if (chain.length === 0) {
    throw new Error("createFallbackModelGateway requires at least one gateway.");
  }

  return {
    async generate<T>(request: ModelGatewayRequest): Promise<ModelGatewayResult<T>> {
      let last: ModelGatewayResult<T> = { ok: false, code: "configuration_unavailable", retryable: false };
      for (const gateway of chain) {
        if (request.signal.aborted) return { ok: false, code: "cancelled", retryable: false };
        const result = await gateway.generate<T>(request);
        if (result.ok) return result;
        // Caller-side cancellation and privacy rejection are provider-agnostic.
        if (result.code === "cancelled" || result.code === "privacy_violation") return result;
        last = result;
      }
      return last;
    },

    async streamGenerate(request: ModelStreamRequest): Promise<ModelStreamResult> {
      let last: ModelStreamResult = { ok: false, code: "configuration_unavailable", retryable: false };
      for (const gateway of chain) {
        if (request.signal.aborted) return { ok: false, code: "cancelled", retryable: false };
        if (!gateway.streamGenerate) continue;
        let buffered = "";
        const result = await gateway.streamGenerate({
          ...request,
          onText: (delta) => {
            buffered += delta;
            request.onText(delta);
          },
        });
        if (result.ok) {
          return { ok: true, text: result.text || buffered };
        }
        if (result.code === "cancelled" || result.code === "privacy_violation") return result;
        last = result;
      }
      return last;
    },
  };
}
