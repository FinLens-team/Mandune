import {
  createAnalysisOrchestrator,
  type EventEvidenceSource,
  type MarketEvidenceSource,
} from "../../analysis/index.js";
import type { EvidenceRecord } from "../../contracts/index.js";
import type { ModelGateway } from "../../model/index.js";
import type { AnalysisExecution, AnalysisExecutor } from "./types.js";

export interface LiveAnalysisExecutorDependencies {
  modelGateway: ModelGateway;
  marketEvidenceSource: MarketEvidenceSource;
  eventEvidenceSource?: EventEvidenceSource;
}

export interface LiveAnalysisExecutorOptions {
  targetDurationMs?: number;
  hardDeadlineMs?: number;
  /** Bounded retries ride out intermittent, retryable upstream failures. */
  maxModelAttempts?: number;
  modelAttemptTimeoutMs?: number;
}

/**
 * Event discovery is not wired to a verified upstream yet. Returning no
 * candidates keeps the orchestrator honest: it records a failed candidate_event
 * marker instead of fabricating time-stamped events.
 */
class NoEventEvidenceSource implements EventEvidenceSource {
  async collectEventEvidence(): Promise<EvidenceRecord[]> {
    return [];
  }
}

/**
 * Compute the most recent completed A-share trading day (date-only, UTC).
 * Stepping back from now minus 24h guarantees the frozen day starts strictly
 * before the evidence cutoff, and weekends are skipped. Exchange holidays are
 * not modeled; a mismatch simply downgrades coverage to observation_only.
 */
export function latestCompleteTradingDay(now: Date): string {
  const day = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const utc = new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate()));
  while (utc.getUTCDay() === 0 || utc.getUTCDay() === 6) {
    utc.setUTCDate(utc.getUTCDate() - 1);
  }
  return utc.toISOString().slice(0, 10);
}

/**
 * Wraps the evidence-bounded analysis orchestrator (#30) behind the server's
 * AnalysisExecutor contract. Persistence stays owned by JourneyAnalysisService,
 * so this executor runs the orchestrator without a result sink and lets the
 * service emit the persist_or_return stage after a validated result returns.
 */
export class LiveAnalysisExecutor implements AnalysisExecutor {
  constructor(
    private readonly dependencies: LiveAnalysisExecutorDependencies,
    private readonly options: LiveAnalysisExecutorOptions = {},
  ) {}

  async execute(input: Parameters<AnalysisExecutor["execute"]>[0]): Promise<AnalysisExecution> {
    const startedAt = input.now();
    const evidenceCutoffAt = startedAt.toISOString();
    const tradingDay = latestCompleteTradingDay(startedAt);

    const orchestrator = createAnalysisOrchestrator(
      {
        marketEvidenceSource: this.dependencies.marketEvidenceSource,
        eventEvidenceSource: this.dependencies.eventEvidenceSource ?? new NoEventEvidenceSource(),
        modelGateway: this.dependencies.modelGateway,
        createId: () => input.analysisId,
        now: input.now,
        onEvent: (event) => {
          // The journey service owns the immutable persistence stage.
          if (event.stage === "persist_or_return") return;
          input.emit(event.stage, event.state, {
            ...(event.message !== undefined ? { message: event.message } : {}),
            ...(event.covered_count !== undefined ? { covered_count: event.covered_count } : {}),
            ...(event.retry_count !== undefined ? { retry_count: event.retry_count } : {}),
          });
        },
      },
      {
        targetDurationMs: this.options.targetDurationMs ?? 90_000,
        hardDeadlineMs: this.options.hardDeadlineMs ?? 180_000,
        ...(this.options.maxModelAttempts !== undefined
          ? { maxModelAttempts: this.options.maxModelAttempts }
          : {}),
        ...(this.options.modelAttemptTimeoutMs !== undefined
          ? { modelAttemptTimeoutMs: this.options.modelAttemptTimeoutMs }
          : {}),
      },
    );

    const result = await orchestrator.run({
      snapshot: input.snapshot,
      latestCompleteTradingDay: tradingDay,
      evidenceCutoffAt,
    });

    const isLive = result.analysis.status !== "unavailable";
    return {
      analysis: result.analysis,
      ...(result.narrative ? { narrative: result.narrative } : {}),
      rational_analysis_version: result.rational_analysis_version,
      source: isLive
        ? { kind: "live", is_live: true, label: "实时行情 + 模型分析" }
        : { kind: "unavailable", is_live: false, label: "实时数据或模型输出当前不可用" },
    };
  }
}
