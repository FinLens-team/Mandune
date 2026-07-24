import { HistoryService, HistoryWorkspaceLifecycle } from "../history/index.js";
import { WorkspaceService } from "../workspace/index.js";
import type { ServerConfig } from "../server/config.js";
import { openSqliteDatabase } from "./database.js";
import { SqliteHistoryStore } from "./history-store.js";
import { SqliteWorkspaceStore } from "./workspace-store.js";

export function createDurableServices(config: ServerConfig) {
  const database = openSqliteDatabase({
    dbPath: config.dbPath,
    migrationsDirectory: config.migrationsDirectory,
    busyTimeoutMs: config.dbBusyTimeoutMs,
  });
  const workspaces = new WorkspaceService(new SqliteWorkspaceStore(database));
  const history = new HistoryService(new SqliteHistoryStore(database));
  return {
    database,
    workspaces,
    history,
    lifecycle: new HistoryWorkspaceLifecycle(workspaces, history),
  };
}
