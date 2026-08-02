import { HistoryService, HistoryWorkspaceLifecycle } from "../history/index.js";
import {
  AtlasService,
  FixtureAtlasCandidateGenerator,
  ModelAtlasCandidateGenerator,
} from "../atlas/index.js";
import { JourneyAnalysisService, StreamingAnalysisExecutor } from "../app/server/index.js";
import { DailyReviewV2Executor } from "../app/server/daily-review-v2-executor.js";
import { RandomExampleValuationService } from "../app/server/random-example-valuation.js";
import {
  createAnthropicMessagesModelGateway,
  createFallbackModelGateway,
  createOpenAICompatibleModelGateway,
} from "../model/index.js";
import {
  BochaEvidenceCollector,
  BochaWebSearchClient,
  CachedPandaEvidenceCollector,
  AkshareMarketEvidenceSource,
  PandaBatchClient,
  FallbackMarketEvidenceSource,
  SupplementedMarketEvidenceCollector,
  TencentMarketEvidenceSource,
} from "../providers/index.js";
import { WorkspaceService } from "../workspace/index.js";
import type { ServerConfig } from "../server/config.js";
import {
  DeepSeekDeepReviewAgent,
  PandaAuthorizedMarketEvidenceSource,
} from "../a2a/index.js";
import { openSqliteDatabase } from "./database.js";
import { SqliteAtlasStore } from "./atlas-store.js";
import { SqliteEvidenceCacheStore } from "./evidence-cache-store.js";
import { SqliteHistoryStore } from "./history-store.js";
import { SqliteJourneyStore } from "./journey-store.js";
import { SqliteWorkspaceStore } from "./workspace-store.js";
import { SqliteMetricsStore } from "./metrics-store.js";
import { MetricsService } from "../metrics/index.js";

export function createDurableServices(config: ServerConfig) {
  const database = openSqliteDatabase({
    dbPath: config.dbPath,
    migrationsDirectory: config.migrationsDirectory,
    busyTimeoutMs: config.dbBusyTimeoutMs,
  });
  const workspaces = new WorkspaceService(new SqliteWorkspaceStore(database));
  const history = new HistoryService(new SqliteHistoryStore(database));
  const metrics = new MetricsService(new SqliteMetricsStore(database));
  const buildModelGateway = (model: NonNullable<ServerConfig["model"]>) =>
    model.protocol === "anthropic_messages"
      ? createAnthropicMessagesModelGateway({
          providerName: model.providerName,
          baseURL: model.baseURL,
          apiKey: model.apiKey,
          modelId: model.modelId,
        })
      : createOpenAICompatibleModelGateway({
          providerName: model.providerName,
          baseURL: model.baseURL,
          apiKey: model.apiKey,
          modelId: model.modelId,
          supportsStructuredOutputs: model.supportsStructuredOutputs,
        });
  // Primary + ordered fallbacks: a flaky or failing primary provider (e.g. an
  // upstream 5xx) transparently falls through to the next configured model.
  const modelGateway = config.model
    ? createFallbackModelGateway([
        buildModelGateway(config.model),
        ...config.modelFallbacks.map(buildModelGateway),
      ])
    : undefined;
  // Atlas cards use the same primary DeepSeek gateway and ordered fallbacks as
  // the daily report, so both outputs share one provider/model contract.
  const atlasCandidateGenerator = modelGateway
    ? new ModelAtlasCandidateGenerator(modelGateway)
    : new FixtureAtlasCandidateGenerator();
  const atlas = new AtlasService(new SqliteAtlasStore(database), atlasCandidateGenerator);
  const journeyStore = new SqliteJourneyStore(database);
  journeyStore.recoverInterruptedRunsNow(new Date().toISOString());
  const evidenceCache = new SqliteEvidenceCacheStore(database);
  // 有模型即可跑真实流程：stream 模式走免鉴权实时行情 + 流式自由文本，
  // 不依赖 PandaAI/Bocha 凭据；v2 模式保留严格每日复盘管线。
  const executor = modelGateway
    ? config.analysisMode === "v2"
      ? new DailyReviewV2Executor(
          {
            modelGateway,
            // PandaAI 为主，未覆盖持仓用免鉴权公开行情逐项兜底。
            marketEvidenceCollector: new SupplementedMarketEvidenceCollector(
              new CachedPandaEvidenceCollector(
                new PandaBatchClient({ pythonExecutable: config.pandaPythonExecutable }),
                evidenceCache,
              ),
              new FallbackMarketEvidenceSource(
                new AkshareMarketEvidenceSource({ pythonExecutable: config.aksharePythonExecutable }),
                new TencentMarketEvidenceSource(),
              ),
            ),
            eventEvidenceCollector: new BochaEvidenceCollector(
              new BochaWebSearchClient(config.bochaApiKey ?? ""),
              evidenceCache,
            ),
            listAtlasCards: (workspaceId) => atlas.listCards(workspaceId),
            atlasCandidateGenerator,
          },
          { hardDeadlineMs: config.analysisDeadlineMs, modelTimeoutMs: 90_000 },
        )
      : new StreamingAnalysisExecutor({
          modelGateway,
          marketEvidenceSource: new FallbackMarketEvidenceSource(
            new AkshareMarketEvidenceSource({ pythonExecutable: config.aksharePythonExecutable }),
            new TencentMarketEvidenceSource(),
          ),
        }, { hardDeadlineMs: config.analysisDeadlineMs })
    : undefined;
  const journey = executor
    ? new JourneyAnalysisService(journeyStore, history, executor, undefined, undefined, atlas)
    : new JourneyAnalysisService(journeyStore, history, undefined, undefined, undefined, atlas);
  const randomExamples = new RandomExampleValuationService({
    // Public daily bars are deliberately labeled delayed by the service; a
    // provider failure becomes an explicit local example fallback instead.
    marketEvidenceSource: new TencentMarketEvidenceSource(),
  });
  const a2a = config.a2a
    ? {
        runner: new DeepSeekDeepReviewAgent({
          baseURL: config.a2a.baseURL,
          apiKey: config.a2a.apiKey,
          modelId: config.a2a.modelId,
          marketEvidenceSource: new PandaAuthorizedMarketEvidenceSource(
            new CachedPandaEvidenceCollector(
              new PandaBatchClient({ pythonExecutable: config.pandaPythonExecutable }),
              evidenceCache,
            ),
          ),
        }),
        bearerToken: config.a2a.bearerToken,
        ...(config.a2a.publicBaseUrl ? { publicBaseUrl: config.a2a.publicBaseUrl } : {}),
      }
    : undefined;
  return {
    database,
    workspaces,
    history,
    metrics,
    atlas,
    evidenceCache,
    journey,
    randomExamples,
    journeyStore,
    ...(a2a ? { a2a } : {}),
    lifecycle: new HistoryWorkspaceLifecycle(workspaces, history),
  };
}
