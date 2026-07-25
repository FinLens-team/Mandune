import { HistoryService, HistoryWorkspaceLifecycle } from "../history/index.js";
import {
  AtlasService,
  FixtureAtlasCandidateGenerator,
  ModelAtlasCandidateGenerator,
} from "../atlas/index.js";
import { JourneyAnalysisService } from "../app/server/index.js";
import { StreamingAnalysisExecutor } from "../app/server/stream-executor.js";
import { createOpenAICompatibleModelGateway } from "../model/index.js";
import { TencentMarketEvidenceSource } from "../providers/tencent-market.js";
import { WorkspaceService } from "../workspace/index.js";
import type { ServerConfig } from "../server/config.js";
import { openSqliteDatabase } from "./database.js";
import { SqliteAtlasStore } from "./atlas-store.js";
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
  const atlas = new AtlasService(
    new SqliteAtlasStore(database),
    modelGateway
      ? new ModelAtlasCandidateGenerator(modelGateway)
      : new FixtureAtlasCandidateGenerator(),
  );
  const journeyStore = new SqliteJourneyStore(database);
  journeyStore.recoverInterruptedRunsNow(new Date().toISOString());
  // With MODEL_* configured, stream a relaxed free-text model analysis over the
  // deterministic evidence + coverage shell; otherwise fall back to the
  // deterministic fixture executor.
  const executor = modelGateway
    ? new StreamingAnalysisExecutor(
        {
          modelGateway,
          marketEvidenceSource: new TencentMarketEvidenceSource(),
        },
      )
    : undefined;
  const journey = executor
    ? new JourneyAnalysisService(journeyStore, history, executor, undefined, undefined, atlas)
    : new JourneyAnalysisService(journeyStore, history, undefined, undefined, undefined, atlas);
  return {
    database,
    workspaces,
    history,
    atlas,
    journey,
    journeyStore,
    lifecycle: new HistoryWorkspaceLifecycle(workspaces, history),
  };
}
