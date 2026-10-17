export const MIGRATIONS = [
  `CREATE TABLE IF NOT EXISTS apps (
    id TEXT PRIMARY KEY NOT NULL, name TEXT NOT NULL, color TEXT NOT NULL,
    icon TEXT NOT NULL, category TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS usage_sessions (
    id TEXT PRIMARY KEY NOT NULL, app_id TEXT NOT NULL REFERENCES apps(id),
    started_at INTEGER NOT NULL, ended_at INTEGER NOT NULL,
    CHECK(ended_at > started_at)
  );
  CREATE INDEX IF NOT EXISTS sessions_started_at ON usage_sessions(started_at);
  CREATE INDEX IF NOT EXISTS sessions_app_time ON usage_sessions(app_id, started_at);
  CREATE TABLE IF NOT EXISTS app_limits (
    id TEXT PRIMARY KEY NOT NULL, app_id TEXT NOT NULL REFERENCES apps(id),
    minutes REAL NOT NULL CHECK(minutes > 0), enabled INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS schedules (
    id TEXT PRIMARY KEY NOT NULL, name TEXT NOT NULL, start_time TEXT NOT NULL,
    end_time TEXT NOT NULL, days_json TEXT NOT NULL, app_ids_json TEXT NOT NULL,
    enabled INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS app_metadata (
    key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL
  );`,
] as const;
