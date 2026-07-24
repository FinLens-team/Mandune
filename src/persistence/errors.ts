export type PersistenceErrorCode =
  | "database_unavailable"
  | "corrupt_database"
  | "unknown_schema"
  | "migration_failed"
  | "lock_timeout"
  | "storage_failure";

const PUBLIC_MESSAGES: Record<PersistenceErrorCode, string> = {
  database_unavailable: "Persistent storage is unavailable.",
  corrupt_database: "Persistent storage could not be verified.",
  unknown_schema: "Persistent storage schema is unsupported.",
  migration_failed: "Persistent storage migration failed.",
  lock_timeout: "Persistent storage is busy.",
  storage_failure: "Persistent storage operation failed.",
};

export class PersistenceError extends Error {
  constructor(readonly code: PersistenceErrorCode) {
    super(PUBLIC_MESSAGES[code]);
    this.name = "PersistenceError";
  }
}

export function persistenceError(error: unknown): PersistenceError {
  if (error instanceof PersistenceError) return error;
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  if (message.includes("locked") || message.includes("busy")) {
    return new PersistenceError("lock_timeout");
  }
  return new PersistenceError("storage_failure");
}
