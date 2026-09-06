"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const Database = require("better-sqlite3");
const {
  classifyRevokeError,
  revokeGoogleRefreshToken,
  clearAllGoogleRefreshTokens,
  disconnectGoogleAuthorization,
  googleDisconnectResponseBody
} = require("./google-disconnect");
const {
  deleteAuthenticatedAccount,
  countActiveAdmins
} = require("./account-deletion");
const { ensureAppUserSchema, bootstrapAdminUser, createProjectUser, findAppUserById } = require("./app-users");
const { hashPassword } = require("./password");
const { ROLES } = require("./authz");

function wrapBetterSqlite(sqlite) {
  return {
    driver: "better-sqlite3",
    ready: Promise.resolve(),
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

async function setupDb() {
  const sqlite = new Database(":memory:");
  sqlite.pragma("foreign_keys = ON");
  const db = wrapBetterSqlite(sqlite);
  await ensureAppUserSchema(db);
  await db.exec(`
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
      sheet_title TEXT NOT NULL,
      columns_json TEXT NOT NULL DEFAULT '[]',
      sync_snapshot_json TEXT NOT NULL DEFAULT '{}',
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS lead_remarks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL,
      lead_id TEXT NOT NULL,
      body TEXT NOT NULL,
      author_user_id INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS lead_timeline_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL,
      lead_id TEXT NOT NULL,
      event_type TEXT NOT NULL,
      actor_user_id INTEGER
    );
    CREATE TABLE IF NOT EXISTS sessions (
      sid TEXT PRIMARY KEY,
      sess TEXT NOT NULL,
      expires_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS mobile_session_tokens (
      token_hash TEXT PRIMARY KEY,
      sid TEXT NOT NULL,
      user_id INTEGER NOT NULL,
      expires_at INTEGER NOT NULL
    );
  `);
  const adminHash = await hashPassword("AdminPass123!");
  await bootstrapAdminUser(db, { loginId: "admin01", passwordHash: adminHash });
  return { db, sqlite };
}

test("revoke classifier distinguishes network and already-invalid", () => {
  assert.equal(classifyRevokeError({ code: "ENOTFOUND" }), "network");
  assert.equal(classifyRevokeError({ message: "invalid_token" }), "already_invalid");
  assert.equal(classifyRevokeError({ response: { status: 400 } }), "already_invalid");
  assert.equal(classifyRevokeError({ message: "unexpected" }), "error");
});

test("disconnect clears encrypted token without deleting projects or sheets identity", async () => {
  const { db } = await setupDb();
  await db.prepare(
    `INSERT INTO users (google_sub, email, name, refresh_token_enc)
     VALUES ('g1', 'sheets@example.com', 'Sheets Admin', 'enc.token.value')`
  ).run();
  await db.prepare(
    `INSERT INTO projects (user_id, name, spreadsheet_id, sheet_title)
     VALUES (1, 'Mayur City', 'sheet-abc', 'Leads')`
  ).run();
  await db.prepare(
    `INSERT INTO lead_remarks (project_id, lead_id, body, author_user_id)
     VALUES (1, '2', 'Keep remark', 1)`
  ).run();

  let revokedTokenSeen = false;
  const result = await disconnectGoogleAuthorization(db, {
    connection: await db.prepare("SELECT * FROM users WHERE id = 1").get(),
    decryptFn: () => "plaintext-refresh-token-for-test",
    revokeFn: async token => {
      revokedTokenSeen = token === "plaintext-refresh-token-for-test";
    }
  });

  assert.equal(result.ok, true);
  assert.equal(result.value.disconnected, true);
  assert.equal(result.value.alreadyDisconnected, false);
  assert.equal(result.value.revokeStatus, "revoked");
  assert.equal(revokedTokenSeen, true);
  assert.equal(result.value.preservedProjects, true);
  assert.equal(result.value.preservedSheets, true);

  const user = await db.prepare("SELECT * FROM users WHERE id = 1").get();
  assert.equal(user.refresh_token_enc, null);
  assert.equal(user.email, "sheets@example.com");

  const projects = await db.prepare("SELECT * FROM projects").all();
  assert.equal(projects.length, 1);
  assert.equal(projects[0].name, "Mayur City");

  const remarks = await db.prepare("SELECT * FROM lead_remarks").all();
  assert.equal(remarks.length, 1);

  const body = googleDisconnectResponseBody(result.value);
  assert.equal(body.ok, true);
  assert.doesNotMatch(JSON.stringify(body), /plaintext|refresh_token_enc|enc\.token/);
});

test("already disconnected is idempotent", async () => {
  const { db } = await setupDb();
  await db.prepare(
    `INSERT INTO users (google_sub, email, name, refresh_token_enc)
     VALUES ('g1', 'sheets@example.com', 'Sheets Admin', NULL)`
  ).run();

  const first = await disconnectGoogleAuthorization(db, {
    connection: await db.prepare("SELECT * FROM users WHERE id = 1").get(),
    decryptFn: () => {
      throw new Error("should not decrypt");
    }
  });
  assert.equal(first.value.alreadyDisconnected, true);

  const second = await disconnectGoogleAuthorization(db, {
    connection: await db.prepare("SELECT * FROM users WHERE id = 1").get(),
    decryptFn: () => {
      throw new Error("should not decrypt");
    }
  });
  assert.equal(second.value.alreadyDisconnected, true);
  assert.equal(second.value.clearedTokens, 0);
});

test("invalid Google token still clears local credential", async () => {
  const { db } = await setupDb();
  await db.prepare(
    `INSERT INTO users (google_sub, email, name, refresh_token_enc)
     VALUES ('g1', 'sheets@example.com', 'Sheets Admin', 'enc.token.value')`
  ).run();

  const result = await disconnectGoogleAuthorization(db, {
    connection: await db.prepare("SELECT * FROM users WHERE id = 1").get(),
    decryptFn: () => "dead-token",
    revokeFn: async () => {
      const err = new Error("invalid_token");
      err.code = "400";
      throw err;
    }
  });

  assert.equal(result.value.revokeStatus, "already_invalid");
  const user = await db.prepare("SELECT refresh_token_enc FROM users WHERE id = 1").get();
  assert.equal(user.refresh_token_enc, null);
});

test("network revoke failure still clears local credential", async () => {
  const { db } = await setupDb();
  await db.prepare(
    `INSERT INTO users (google_sub, email, name, refresh_token_enc)
     VALUES ('g1', 'sheets@example.com', 'Sheets Admin', 'enc.token.value')`
  ).run();

  const result = await disconnectGoogleAuthorization(db, {
    connection: await db.prepare("SELECT * FROM users WHERE id = 1").get(),
    decryptFn: () => "live-token",
    revokeFn: async () => {
      const err = new Error("getaddrinfo ENOTFOUND");
      err.code = "ENOTFOUND";
      throw err;
    }
  });

  assert.equal(result.value.revokeStatus, "network");
  const user = await db.prepare("SELECT refresh_token_enc FROM users WHERE id = 1").get();
  assert.equal(user.refresh_token_enc, null);
});

test("account deletion preserves shared Google authorization for remaining admins", async () => {
  const { db } = await setupDb();
  const secondHash = await hashPassword("AdminPass456!");
  await db.prepare(
    `INSERT INTO app_users (name, login_id, password_hash, role, is_active)
     VALUES (?, ?, ?, ?, 1)`
  ).run("Admin Two", "admin02", secondHash, ROLES.ADMIN);

  await db.prepare(
    `INSERT INTO users (google_sub, email, name, refresh_token_enc)
     VALUES ('g1', 'sheets@example.com', 'Sheets Admin', 'enc.token.value')`
  ).run();
  await db.prepare(
    `INSERT INTO projects (user_id, name, spreadsheet_id, sheet_title)
     VALUES (1, 'Mayur City', 'sheet-abc', 'Leads')`
  ).run();

  const admin = await db.prepare("SELECT * FROM app_users WHERE login_id = ?").get("admin01");
  const deleted = await deleteAuthenticatedAccount(db, { user: admin });
  assert.equal(deleted.ok, true);
  assert.equal(deleted.value.preservedGoogleAuthorization, true);
  assert.equal(await countActiveAdmins(db), 1);

  const google = await db.prepare("SELECT * FROM users").all();
  assert.equal(google.length, 1);
  assert.equal(google[0].refresh_token_enc, "enc.token.value");
  assert.equal((await db.prepare("SELECT COUNT(*) AS c FROM projects").get()).c, 1);
});

test("clearAllGoogleRefreshTokens removes only credentials", async () => {
  const { db } = await setupDb();
  await db.prepare(
    `INSERT INTO users (google_sub, email, name, refresh_token_enc)
     VALUES ('g1', 'a@example.com', 'A', 'enc.a')`
  ).run();
  await db.prepare(
    `INSERT INTO users (google_sub, email, name, refresh_token_enc)
     VALUES ('g2', 'b@example.com', 'B', 'enc.b')`
  ).run();
  const cleared = await clearAllGoogleRefreshTokens(db);
  assert.equal(cleared, 2);
  const rows = await db.prepare("SELECT refresh_token_enc FROM users").all();
  assert.ok(rows.every(row => row.refresh_token_enc == null));
});

test("revokeGoogleRefreshToken skips empty tokens", async () => {
  assert.deepEqual(await revokeGoogleRefreshToken(""), { status: "skipped" });
  assert.deepEqual(await revokeGoogleRefreshToken(null), { status: "skipped" });
});

test("server and web UI wire Google disconnect without exposing tokens", () => {
  const server = fs.readFileSync(path.join(__dirname, "server.js"), "utf8");
  const appJs = fs.readFileSync(path.join(__dirname, "public/app.js"), "utf8");
  const index = fs.readFileSync(path.join(__dirname, "public/index.html"), "utf8");
  const privacy = fs.readFileSync(path.join(__dirname, "public/privacy.html"), "utf8");
  const mobileNew = fs.readFileSync(
    path.join(__dirname, "mobile/app/(app)/projects/new.tsx"),
    "utf8"
  );

  assert.match(server, /app\.post\("\/api\/google\/disconnect"/);
  assert.match(server, /requireAdmin/);
  assert.match(server, /csrfProtection/);
  assert.match(server, /disconnectGoogleAuthorization/);
  assert.match(server, /googleDisconnectResponseBody/);
  assert.doesNotMatch(server, /res\.json\(\s*\{[^}]*refresh_token_enc\s*:/);
  assert.doesNotMatch(server, /res\.json\(\s*\{[^}]*refresh_token\s*:/);

  assert.match(index, /googleDisconnectBtn/);
  assert.match(appJs, /\/api\/google\/disconnect/);
  assert.match(appJs, /Disconnect Google\?/);
  assert.match(appJs, /projects and lead data will not be deleted/i);
  assert.doesNotMatch(appJs, /refresh_token|TOKEN_ENCRYPTION|client_secret/);

  assert.match(privacy, /Disconnect Google/);
  assert.match(privacy, /not bound to an individual CRM login/i);

  // Mobile exposes Google status for project creation but not disconnect UI.
  assert.match(mobileNew, /Connect Google from the Website CRM admin on the web/);
  assert.doesNotMatch(mobileNew, /google\/disconnect|Disconnect Google/);
});
