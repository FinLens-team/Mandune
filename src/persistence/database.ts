import { chmodSync, closeSync, openSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { PersistenceError, persistenceError } from "./errors.js";

const MIGRATION_FILES = [
  "001-initial.sql",
  "002-journey-backend.sql",
  "003-daily-review-v2-evidence-cache.sql",
] as const;
const LATEST_SCHEMA_VERSION = MIGRATION_FILES.length;
const DATABASE_FILE_MODE = 0o600;

export interface OpenDatabaseOptions {
  dbPath: string;
  migrationsDirectory: string;
  busyTimeoutMs?: number;
}

interface PragmaRow {
  [key: string]: string | number | bigint | null;
}

function pragmaNumber(database: DatabaseSync, sql: string, key: string): number {
  const row = database.prepare(sql).get() as PragmaRow | undefined;
  const value = row?.[key];
  if (typeof value === "bigint") return Number(value);
  return typeof value === "number" ? value : Number(value);
}

function applyPrivateFileMode(dbPath: string): void {
  for (const candidate of [dbPath, `${dbPath}-wal`, `${dbPath}-shm`]) {
    try {
      if (statSync(candidate).isFile()) chmodSync(candidate, DATABASE_FILE_MODE);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
}

function rollback(database: DatabaseSync): void {
  try {
    database.exec("ROLLBACK");
  } catch {
    // The original storage failure is the useful signal.
  }
}

function applyMigrations(database: DatabaseSync, directory: string): void {
  const current = pragmaNumber(database, "PRAGMA user_version", "user_version");
  if (!Number.isInteger(current) || current < 0 || current > LATEST_SCHEMA_VERSION) {
    throw new PersistenceError("unknown_schema");
  }
  if (current === LATEST_SCHEMA_VERSION) return;

  for (let version = current + 1; version <= LATEST_SCHEMA_VERSION; version += 1) {
    const filename = MIGRATION_FILES[version - 1];
    if (!filename) throw new PersistenceError("migration_failed");
    try {
      const sql = readFileSync(path.join(directory, filename), "utf8");
      database.exec("BEGIN IMMEDIATE");
      database.exec(sql);
      database.exec(`PRAGMA user_version = ${version}`);
      database.exec("COMMIT");
    } catch {
      rollback(database);
      throw new PersistenceError("migration_failed");
    }
  }
}

function verifyIntegrity(database: DatabaseSync): void {
  let result: unknown;
  try {
    result = (database.prepare("PRAGMA integrity_check").get() as PragmaRow | undefined)?.integrity_check;
  } catch {
    throw new PersistenceError("corrupt_database");
  }
  if (result !== "ok") throw new PersistenceError("corrupt_database");
}

export class SqliteDatabase {
  private closed = false;

  constructor(
    private readonly database: DatabaseSync,
    readonly path: string,
  ) {}

  prepare(sql: string): ReturnType<DatabaseSync["prepare"]> {
    if (this.closed) throw new PersistenceError("database_unavailable");
    return this.database.prepare(sql);
  }

  read<T>(operation: () => T): T {
    if (this.closed) throw new PersistenceError("database_unavailable");
    try {
      return operation();
    } catch (error) {
      throw persistenceError(error);
    }
  }

  transaction<T>(operation: () => T): T {
    if (this.closed) throw new PersistenceError("database_unavailable");
    try {
      this.database.exec("BEGIN IMMEDIATE");
      const result = operation();
      applyPrivateFileMode(this.path);
      this.database.exec("COMMIT");
      return result;
    } catch (error) {
      rollback(this.database);
      throw persistenceError(error);
    }
  }

  close(): void {
    if (this.closed) return;
    this.database.close();
    this.closed = true;
  }
}

export function openSqliteDatabase(options: OpenDatabaseOptions): SqliteDatabase {
  const busyTimeoutMs = options.busyTimeoutMs ?? 1_000;
  if (!Number.isInteger(busyTimeoutMs) || busyTimeoutMs < 0 || busyTimeoutMs > 60_000) {
    throw new PersistenceError("database_unavailable");
  }

  let database: DatabaseSync | undefined;
  try {
    const descriptor = openSync(options.dbPath, "a", DATABASE_FILE_MODE);
    closeSync(descriptor);
    chmodSync(options.dbPath, DATABASE_FILE_MODE);
    database = new DatabaseSync(options.dbPath);
    database.exec("PRAGMA trusted_schema = OFF");
    database.exec("PRAGMA foreign_keys = ON");
    database.exec(`PRAGMA busy_timeout = ${busyTimeoutMs}`);
    const journal = database.prepare("PRAGMA journal_mode = WAL").get() as PragmaRow | undefined;
    if (journal?.journal_mode !== "wal") throw new PersistenceError("database_unavailable");
    if (pragmaNumber(database, "PRAGMA foreign_keys", "foreign_keys") !== 1) {
      throw new PersistenceError("database_unavailable");
    }
    verifyIntegrity(database);
    applyMigrations(database, options.migrationsDirectory);
    verifyIntegrity(database);
    applyPrivateFileMode(options.dbPath);
    return new SqliteDatabase(database, options.dbPath);
  } catch (error) {
    try {
      database?.close();
    } catch {
      // Startup remains failed closed even if the broken handle cannot close.
    }
    if (error instanceof PersistenceError) throw error;
    const message = error instanceof Error ? error.message.toLowerCase() : "";
    if (message.includes("not a database") || message.includes("malformed")) {
      throw new PersistenceError("corrupt_database");
    }
    throw new PersistenceError("database_unavailable");
  }
}

export const SQLITE_SCHEMA_VERSION = LATEST_SCHEMA_VERSION;
