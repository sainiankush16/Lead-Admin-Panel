"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const Database = require("better-sqlite3");
const {
  ensureAppUserSchema,
  bootstrapAdminUser,
  createProjectUser,
  authenticateAppUser,
  findAppUserById
} = require("./app-users");
const { hashPassword } = require("./password");
const { ROLES } = require("./authz");
const {
  ensureMobileSessionTokenSchema,
  issueMobileSessionToken,
  lookupMobileSessionToken
} = require("./mobile-auth");
const {
  DELETED_DISPLAY_NAME,
  countActiveAdmins,
  deleteAuthenticatedAccount,
  accountDeletionResponseBody
} = require("./account-deletion");

const SECRET = "test-session-secret-for-account-deletion-tests";

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
  await ensureMobileSessionTokenSchema(db);
  await db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      sid TEXT PRIMARY KEY,
      sess TEXT NOT NULL,
      expires_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      google_sub TEXT NOT NULL UNIQUE,
      email TEXT NOT NULL UNIQUE,
      name TEXT,
      picture TEXT,
      refresh_token_enc TEXT
    );
    CREATE TABLE IF NOT EXISTS projects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      spreadsheet_id TEXT NOT NULL,
      sheet_title TEXT NOT NULL,
      columns_json TEXT NOT NULL DEFAULT '[]',
      sync_snapshot_json TEXT NOT NULL DEFAULT '{}'
    );
    CREATE TABLE IF NOT EXISTS lead_remarks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL,
      lead_id TEXT NOT NULL,
      body TEXT NOT NULL,
      author_user_id INTEGER NOT NULL,
      is_deleted INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY(author_user_id) REFERENCES app_users(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS lead_timeline_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL,
      lead_id TEXT NOT NULL,
      event_type TEXT NOT NULL,
      event_data TEXT NOT NULL DEFAULT '{}',
      actor_user_id INTEGER,
      is_deleted INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY(actor_user_id) REFERENCES app_users(id) ON DELETE SET NULL
    );
  `);
  const adminHash = await hashPassword("AdminPass123!");
  await bootstrapAdminUser(db, { loginId: "admin01", passwordHash: adminHash });
  return { db, sqlite };
}

test("account deletion anonymizes project user and preserves remarks", async () => {
  const { db } = await setupDb();
  const created = await createProjectUser(db, {
    name: "Sales One",
    loginId: "sales01",
    password: "SalesPass123!"
  });
  const userId = created.value.id;

  await db.prepare(
    "INSERT INTO lead_remarks (project_id, lead_id, body, author_user_id) VALUES (1, '2', 'Keep me', ?)"
  ).run(userId);

  const issued = await issueMobileSessionToken(db, {
    sid: "sid-sales",
    userId,
    secret: SECRET
  });
  assert.equal((await lookupMobileSessionToken(db, issued.rawToken, SECRET)).status, "ok");

  const result = await deleteAuthenticatedAccount(db, {
    user: await findAppUserById(db, userId),
    sessionStore: null,
    currentSid: "sid-sales"
  });
  assert.equal(result.ok, true);
  assert.equal(result.value.preservedLeadData, true);
  assert.equal(result.value.preservedGoogleSheets, true);
  assert.equal(result.value.preservedGoogleAuthorization, true);

  const deleted = await findAppUserById(db, userId);
  assert.equal(deleted.is_active, 0);
  assert.equal(deleted.name, DELETED_DISPLAY_NAME);
  assert.match(deleted.login_id, /^deleted_/);
  assert.doesNotMatch(deleted.login_id, /sales01/i);

  const auth = await authenticateAppUser(db, "sales01", "SalesPass123!");
  assert.equal(auth.ok, false);

  const remarks = await db.prepare("SELECT * FROM lead_remarks WHERE author_user_id = ?").all(userId);
  assert.equal(remarks.length, 1);
  assert.equal(remarks[0].body, "Keep me");

  assert.equal((await lookupMobileSessionToken(db, issued.rawToken, SECRET)).status, "missing");
  assert.equal(JSON.stringify(accountDeletionResponseBody()).includes("password"), false);
  assert.equal(JSON.stringify(result).includes("password_hash"), false);
});

test("final admin cannot be deleted", async () => {
  const { db } = await setupDb();
  const admin = await db.prepare("SELECT * FROM app_users WHERE role = ?").get(ROLES.ADMIN);
  assert.equal(await countActiveAdmins(db), 1);

  const result = await deleteAuthenticatedAccount(db, { user: admin });
  assert.equal(result.ok, false);
  assert.equal(result.statusCode, 403);
  assert.match(result.error, /final administrator/i);

  const still = await findAppUserById(db, admin.id);
  assert.equal(still.is_active, 1);
  assert.equal(still.login_id, "admin01");
});

test("admin can delete when another admin exists", async () => {
  const { db } = await setupDb();
  const secondHash = await hashPassword("AdminPass456!");
  await db.prepare(
    `INSERT INTO app_users (name, login_id, password_hash, role, is_active)
     VALUES (?, ?, ?, ?, 1)`
  ).run("Admin Two", "admin02", secondHash, ROLES.ADMIN);

  const admin = await db.prepare("SELECT * FROM app_users WHERE login_id = ?").get("admin01");
  const result = await deleteAuthenticatedAccount(db, { user: admin });
  assert.equal(result.ok, true);
  assert.equal(await countActiveAdmins(db), 1);
});

test("deletion does not remove Google connection or projects", async () => {
  const { db } = await setupDb();
  await db.prepare(
    `INSERT INTO users (google_sub, email, name, refresh_token_enc)
     VALUES ('g1', 'sheets@example.com', 'Sheets', 'enc-token')`
  ).run();
  await db.prepare(
    `INSERT INTO projects (user_id, name, spreadsheet_id, sheet_title)
     VALUES (1, 'Mayur City', 'sheet-1', 'Leads')`
  ).run();

  const member = await createProjectUser(db, {
    name: "Member",
    loginId: "member01",
    password: "MemberPass123!"
  });
  await deleteAuthenticatedAccount(db, { user: await findAppUserById(db, member.value.id) });

  const google = await db.prepare("SELECT * FROM users").all();
  assert.equal(google.length, 1);
  assert.equal(google[0].refresh_token_enc, "enc-token");
  const projects = await db.prepare("SELECT * FROM projects").all();
  assert.equal(projects.length, 1);
});

test("unauthenticated deletion helper rejects missing user", async () => {
  const { db } = await setupDb();
  const result = await deleteAuthenticatedAccount(db, { user: null });
  assert.equal(result.ok, false);
  assert.equal(result.statusCode, 401);
});

test("privacy, terms, and delete-account public pages exist without secrets", () => {
  const privacy = fs.readFileSync(path.join(__dirname, "public/privacy.html"), "utf8");
  const terms = fs.readFileSync(path.join(__dirname, "public/terms.html"), "utf8");
  const deleteAccount = fs.readFileSync(
    path.join(__dirname, "public/delete-account.html"),
    "utf8"
  );
  assert.match(privacy, /Website CRM/);
  assert.match(privacy, /\[PRIVACY CONTACT EMAIL\]/);
  assert.match(privacy, /\[LEGAL BUSINESS NAME\]/);
  assert.match(privacy, /account deletion/i);
  assert.match(privacy, /\/delete-account/);
  assert.match(terms, /Terms of Use/);
  assert.match(terms, /\[SUPPORT EMAIL\]/);
  assert.match(terms, /\/delete-account/);
  assert.match(deleteAccount, /Website CRM/);
  assert.match(deleteAccount, /\[PRIVACY CONTACT EMAIL\]/);
  assert.match(deleteAccount, /Deleted User/);
  assert.match(deleteAccount, /does not delete Google Sheets/i);
  assert.doesNotMatch(deleteAccount, /user_id|password_hash|refresh_token/);
  assert.doesNotMatch(privacy, /SESSION_SECRET|TOKEN_ENCRYPTION_KEY|TURSO_AUTH_TOKEN|sk-/);
  assert.doesNotMatch(terms, /password_hash|refresh_token_enc|Bearer /);
});

test("server wires public legal routes and account deletion endpoint", () => {
  const server = fs.readFileSync(path.join(__dirname, "server.js"), "utf8");
  assert.match(server, /app\.get\("\/privacy"/);
  assert.match(server, /app\.get\("\/terms"/);
  assert.match(server, /app\.get\("\/delete-account"/);
  assert.match(server, /app\.delete\("\/api\/account"/);
  assert.match(server, /confirm !== "DELETE"/);
  assert.match(server, /deleteAuthenticatedAccount/);
  assert.doesNotMatch(server, /req\.body\.userId|req\.body\.user_id/);
});

test("mobile More screen wires legal links and delete account", () => {
  const more = fs.readFileSync(path.join(__dirname, "mobile/app/(app)/more.tsx"), "utf8");
  const api = fs.readFileSync(path.join(__dirname, "mobile/services/api.ts"), "utf8");
  const config = fs.readFileSync(path.join(__dirname, "mobile/lib/config.ts"), "utf8");
  const appJson = fs.readFileSync(path.join(__dirname, "mobile/app.json"), "utf8");

  assert.match(more, /Legal & Privacy/);
  assert.match(more, /Delete Account/);
  assert.match(more, /deleteAccountConfirmationCopy/);
  assert.match(more, /getLegalBaseUrl/);
  assert.match(more, /api\.deleteAccount/);
  assert.match(api, /\/api\/account/);
  assert.match(api, /confirm:\s*"DELETE"/);
  assert.match(config, /EXPO_PUBLIC_LEGAL_BASE_URL/);
  assert.match(config, /lead-admin-panel\.vercel\.app/);
  assert.match(appJson, /"name": "Website CRM"/);
  assert.match(appJson, /"bundleIdentifier": "com\.chaturx\.leads"/);
  assert.match(appJson, /"package": "com\.chaturx\.leads"/);
  assert.doesNotMatch(more, /CHATURX|ChaturX|Ankush CRM/);
});
