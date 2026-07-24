import { HistoryService, HistoryWorkspaceLifecycle } from "../history/index.js";
import { JourneyAnalysisService } from "../app/server/index.js";
import { WorkspaceService } from "../workspace/index.js";
import type { ServerConfig } from "../server/config.js";
import { openSqliteDatabase } from "./database.js";
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
  const journeyStore = new SqliteJourneyStore(database);
  journeyStore.recoverInterruptedRunsNow(new Date().toISOString());
  const journey = new JourneyAnalysisService(journeyStore, history);
  return {
    database,
    workspaces,
    history,
    journey,
    journeyStore,
    lifecycle: new HistoryWorkspaceLifecycle(workspaces, history),
  };
}
