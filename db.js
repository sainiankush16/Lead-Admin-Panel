"use strict";

const path = require("path");
const fs = require("fs");

const SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    google_sub TEXT NOT NULL UNIQUE,
    email TEXT NOT NULL UNIQUE,
    name TEXT,
    picture TEXT,
    refresh_token_enc TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    spreadsheet_id TEXT NOT NULL,
    spreadsheet_name TEXT,
    sheet_id INTEGER,
    sheet_title TEXT NOT NULL,
    columns_json TEXT NOT NULL DEFAULT '[]',
    sync_snapshot_json TEXT NOT NULL DEFAULT '{}',
    last_sync TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, spreadsheet_id, sheet_id),
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS sessions (
    sid TEXT PRIMARY KEY,
    sess TEXT NOT NULL,
    expires_at INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS sessions_expires_at_idx ON sessions(expires_at);

  CREATE TABLE IF NOT EXISTS app_users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    login_id TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL,
    is_active INTEGER NOT NULL DEFAULT 1,
    session_version INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS project_user_assignments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    project_id INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, project_id),
    FOREIGN KEY(user_id) REFERENCES app_users(id) ON DELETE CASCADE,
    FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS project_user_assignments_user_idx ON project_user_assignments(user_id);
  CREATE INDEX IF NOT EXISTS project_user_assignments_project_idx ON project_user_assignments(project_id);

  CREATE TABLE IF NOT EXISTS lead_timeline_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL,
    lead_id TEXT NOT NULL,
    event_type TEXT NOT NULL,
    event_data TEXT NOT NULL DEFAULT '{}',
    actor_user_id INTEGER,
    actor_role TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    is_deleted INTEGER NOT NULL DEFAULT 0,
    deleted_by INTEGER,
    deleted_at TEXT,
    FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE,
    FOREIGN KEY(actor_user_id) REFERENCES app_users(id) ON DELETE SET NULL,
    FOREIGN KEY(deleted_by) REFERENCES app_users(id) ON DELETE SET NULL
  );

  CREATE INDEX IF NOT EXISTS lead_timeline_project_idx ON lead_timeline_events(project_id);
  CREATE INDEX IF NOT EXISTS lead_timeline_lead_idx ON lead_timeline_events(project_id, lead_id);
  CREATE INDEX IF NOT EXISTS lead_timeline_created_idx ON lead_timeline_events(created_at);

  CREATE TABLE IF NOT EXISTS lead_remarks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL,
    lead_id TEXT NOT NULL,
    body TEXT NOT NULL,
    author_user_id INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    is_deleted INTEGER NOT NULL DEFAULT 0,
    deleted_by INTEGER,
    deleted_at TEXT,
    FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE,
    FOREIGN KEY(author_user_id) REFERENCES app_users(id) ON DELETE CASCADE,
    FOREIGN KEY(deleted_by) REFERENCES app_users(id) ON DELETE SET NULL
  );

  CREATE INDEX IF NOT EXISTS lead_remarks_project_lead_idx ON lead_remarks(project_id, lead_id);
  CREATE INDEX IF NOT EXISTS lead_remarks_created_idx ON lead_remarks(created_at);

  CREATE TABLE IF NOT EXISTS mobile_session_tokens (
    token_hash TEXT PRIMARY KEY,
    sid TEXT NOT NULL,
    user_id INTEGER NOT NULL,
    expires_at INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE INDEX IF NOT EXISTS mobile_session_tokens_sid_idx ON mobile_session_tokens(sid);
  CREATE INDEX IF NOT EXISTS mobile_session_tokens_user_idx ON mobile_session_tokens(user_id);
  CREATE INDEX IF NOT EXISTS mobile_session_tokens_expires_idx ON mobile_session_tokens(expires_at);
`;

function tursoConfig() {
  const url = String(process.env.TURSO_DATABASE_URL || process.env.LIBSQL_URL || "").trim();
  const authToken = String(process.env.TURSO_AUTH_TOKEN || process.env.LIBSQL_AUTH_TOKEN || "").trim();
  if (!url) return null;
  return { url, authToken: authToken || undefined };
}

function isRemoteDatabaseUrl(url) {
  return /^(libsql:|https:|wss:)/i.test(url);
}

function normalizeRow(row) {
  if (!row) return undefined;
  if (typeof row.toJSON === "function") return row.toJSON();
  return { ...row };
}

function createLocalDatabase() {
  const Database = require("better-sqlite3");
  const dataDir = path.join(__dirname, "data");
  fs.mkdirSync(dataDir, { recursive: true });
  const sqlite = new Database(path.join(dataDir, "lead-admin.db"));
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  sqlite.exec(SCHEMA_SQL);

  const columns = sqlite.prepare("PRAGMA table_info(projects)").all().map(column => column.name);
  if (!columns.includes("sync_snapshot_json")) {
    sqlite.exec("ALTER TABLE projects ADD COLUMN sync_snapshot_json TEXT NOT NULL DEFAULT '{}'");
  }

  return {
    driver: "better-sqlite3",
    async exec(sql) {
      sqlite.exec(sql);
    },
    prepare(sql) {
      const statement = sqlite.prepare(sql);
      return {
        async get(...params) {
          return statement.get(...params);
        },
        async all(...params) {
          return statement.all(...params);
        },
        async run(...params) {
          return statement.run(...params);
        }
      };
    }
  };
}

function createTursoDatabase({ url, authToken }) {
  const { createClient } = require("@libsql/client");
  const client = createClient({ url, authToken });

  return {
    driver: "libsql",
    async exec(sql) {
      const statements = String(sql)
        .split(";")
        .map(part => part.trim())
        .filter(Boolean);
      for (const statement of statements) {
        await client.execute(statement);
      }
    },
    prepare(sql) {
      return {
        async get(...params) {
          const result = await client.execute({ sql, args: params });
          return normalizeRow(result.rows[0]);
        },
        async all(...params) {
          const result = await client.execute({ sql, args: params });
          return result.rows.map(normalizeRow);
        },
        async run(...params) {
          const result = await client.execute({ sql, args: params });
          return {
            changes: Number(result.rowsAffected || 0),
            lastInsertRowid: result.lastInsertRowid == null ? 0n : BigInt(result.lastInsertRowid)
          };
        }
      };
    }
  };
}

async function ensureSchema(db) {
  await db.exec("PRAGMA foreign_keys = ON");
  await db.exec(SCHEMA_SQL);
  const columns = await db.prepare("PRAGMA table_info(projects)").all();
  const names = columns.map(column => column.name);
  if (!names.includes("sync_snapshot_json")) {
    await db.exec("ALTER TABLE projects ADD COLUMN sync_snapshot_json TEXT NOT NULL DEFAULT '{}'");
  }
}

function createDatabase() {
  const remote = tursoConfig();
  if (remote) {
    if (!isRemoteDatabaseUrl(remote.url) && process.env.VERCEL) {
      throw new Error("TURSO_DATABASE_URL must be a remote libsql/https URL on Vercel.");
    }
    return createTursoDatabase(remote);
  }

  if (process.env.VERCEL) {
    throw new Error("TURSO_DATABASE_URL is required when running on Vercel.");
  }

  return createLocalDatabase();
}

const db = createDatabase();
const ready = db.driver === "libsql" ? ensureSchema(db) : Promise.resolve();

module.exports = db;
module.exports.ready = ready;
module.exports.tursoConfig = tursoConfig;
module.exports.createDatabase = createDatabase;
module.exports.ensureSchema = ensureSchema;
