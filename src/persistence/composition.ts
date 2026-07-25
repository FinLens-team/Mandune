import { HistoryService, HistoryWorkspaceLifecycle } from "../history/index.js";
import {
  AtlasService,
  FixtureAtlasCandidateGenerator,
  ModelAtlasCandidateGenerator,
} from "../atlas/index.js";
import { JourneyAnalysisService } from "../app/server/index.js";
import { DailyReviewV2Executor } from "../app/server/daily-review-v2-executor.js";
import { createOpenAICompatibleModelGateway } from "../model/index.js";
import {
  BochaEvidenceCollector,
  BochaWebSearchClient,
  CachedPandaEvidenceCollector,
  PandaBatchClient,
} from "../providers/index.js";
import { WorkspaceService } from "../workspace/index.js";
import type { ServerConfig } from "../server/config.js";
import {
  DeepSeekDeepReviewAgent,
  UnconfiguredAuthorizedMarketEvidenceSource,
} from "../a2a/index.js";
import { openSqliteDatabase } from "./database.js";
import { SqliteAtlasStore } from "./atlas-store.js";
import { SqliteEvidenceCacheStore } from "./evidence-cache-store.js";
import { SqliteHistoryStore } from "./history-store.js";
import { SqliteJourneyStore } from "./journey-store.js";
import { SqliteWorkspaceStore } from "./workspace-store.js";

export function createDurableServices(config: ServerConfig) {
  const database = openSqliteDatabase({
    dbPath: config.dbPath,
    migrationsDirectory: config.migrationsDirectory,
    busyTimeoutMs: config.dbBusyTimeoutMs,
  });
  const workspaces = new WorkspaceService(new SqliteWorkspaceStore(database));
  const history = new HistoryService(new SqliteHistoryStore(database));
  const modelGateway = config.model
    ? createOpenAICompatibleModelGateway({
        providerName: config.model.providerName,
        baseURL: config.model.baseURL,
        apiKey: config.model.apiKey,
        modelId: config.model.modelId,
        supportsStructuredOutputs: config.model.supportsStructuredOutputs,
      })
    : undefined;
  const atlasCandidateGenerator = modelGateway
    ? new ModelAtlasCandidateGenerator(modelGateway)
    : new FixtureAtlasCandidateGenerator();
  const atlas = new AtlasService(new SqliteAtlasStore(database), atlasCandidateGenerator);
  const journeyStore = new SqliteJourneyStore(database);
  journeyStore.recoverInterruptedRunsNow(new Date().toISOString());
  const evidenceCache = new SqliteEvidenceCacheStore(database);
  const executor = modelGateway
    ? new DailyReviewV2Executor(
        {
          modelGateway,
          marketEvidenceCollector: new CachedPandaEvidenceCollector(
            new PandaBatchClient(),
            evidenceCache,
          ),
          eventEvidenceCollector: new BochaEvidenceCollector(
            new BochaWebSearchClient(config.bochaApiKey ?? ""),
            evidenceCache,
          ),
          listAtlasCards: (workspaceId) => atlas.listCards(workspaceId),
          atlasCandidateGenerator,
        },
      )
    : undefined;
  const journey = executor
    ? new JourneyAnalysisService(journeyStore, history, executor, undefined, undefined, atlas)
    : new JourneyAnalysisService(journeyStore, history, undefined, undefined, undefined, atlas);
  const a2a = config.a2a
    ? {
        runner: new DeepSeekDeepReviewAgent({
          baseURL: config.a2a.baseURL,
          apiKey: config.a2a.apiKey,
          modelId: config.a2a.modelId,
          marketEvidenceSource: new UnconfiguredAuthorizedMarketEvidenceSource(),
        }),
        bearerToken: config.a2a.bearerToken,
        ...(config.a2a.publicBaseUrl ? { publicBaseUrl: config.a2a.publicBaseUrl } : {}),
      }
    : undefined;
  return {
    database,
    workspaces,
    history,
    atlas,
    evidenceCache,
    journey,
    journeyStore,
    ...(a2a ? { a2a } : {}),
    lifecycle: new HistoryWorkspaceLifecycle(workspaces, history),
  };
}
