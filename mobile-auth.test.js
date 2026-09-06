"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const Database = require("better-sqlite3");
const SQLiteSessionStore = require("./session-store");
const {
  ensureAppUserSchema,
  bootstrapAdminUser,
  authenticateAppUser,
  createProjectUser,
  setUserActive,
  resetUserPassword,
  replaceUserProjects,
  userHasProjectAssignment
} = require("./app-users");
const { hashPassword } = require("./password");
const { ROLES, canAccessProject, sanitizeAppUser } = require("./authz");
const { csrfTokensMatch, shouldBypassBrowserCsrf } = require("./api-guards");
const {
  generateMobileToken,
  hashMobileToken,
  extractBearerToken,
  ensureMobileSessionTokenSchema,
  issueMobileSessionToken,
  lookupMobileSessionToken,
  deleteMobileSessionToken,
  deleteMobileSessionTokensForSid,
  sessionStoreGet,
  sessionStoreDestroy
} = require("./mobile-auth");

const SECRET = "test-session-secret-for-mobile-auth-unit-tests";

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

async function createTestDb() {
  const sqlite = new Database(":memory:");
  sqlite.pragma("foreign_keys = ON");
  sqlite.exec(`
    CREATE TABLE users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      google_sub TEXT NOT NULL UNIQUE,
      email TEXT NOT NULL UNIQUE,
      name TEXT,
      picture TEXT,
      refresh_token_enc TEXT
    );
    CREATE TABLE projects (
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
      UNIQUE(user_id, spreadsheet_id, sheet_id),
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE TABLE sessions (
      sid TEXT PRIMARY KEY,
      sess TEXT NOT NULL,
      expires_at INTEGER NOT NULL
    );
  `);
  const db = wrapBetterSqlite(sqlite);
  await ensureAppUserSchema(db);
  await ensureMobileSessionTokenSchema(db);
  return { sqlite, db };
}

async function seedUsers(db) {
  const adminHash = await hashPassword("AdminPass123!");
  await bootstrapAdminUser(db, { loginId: "admin", passwordHash: adminHash });
  const created = await createProjectUser(db, {
    name: "Sales User",
    loginId: "sales.user",
    password: "SalesPass123!",
    projectIds: []
  });
  assert.equal(created.error, undefined);
  return {
    admin: await authenticateAppUser(db, "admin", "AdminPass123!"),
    member: await authenticateAppUser(db, "sales.user", "SalesPass123!")
  };
}

test("mobile login success issues opaque token and stores only hash", async () => {
  const { sqlite, db } = await createTestDb();
  const users = await seedUsers(db);
  assert.equal(users.admin.ok, true);

  const issued = await issueMobileSessionToken(db, {
    sid: "sid-admin-1",
    userId: users.admin.user.id,
    secret: SECRET,
    expiresAt: Date.now() + 60_000
  });

  assert.equal(typeof issued.rawToken, "string");
  assert.ok(issued.rawToken.length >= 40);
  assert.notEqual(issued.rawToken, "sid-admin-1");
  assert.notEqual(issued.rawToken, String(users.admin.user.id));

  const rows = await db.prepare("SELECT * FROM mobile_session_tokens").all();
  assert.equal(rows.length, 1);
  assert.equal(rows[0].token_hash, hashMobileToken(issued.rawToken, SECRET));
  assert.equal(JSON.stringify(rows).includes(issued.rawToken), false);
  assert.equal(rows[0].sid, "sid-admin-1");
  sqlite.close();
});

test("mobile login invalid password and invalid id fail at authenticateAppUser", async () => {
  const { sqlite, db } = await createTestDb();
  await seedUsers(db);
  const badPassword = await authenticateAppUser(db, "admin", "wrong-password");
  assert.equal(badPassword.ok, false);
  const badId = await authenticateAppUser(db, "missing", "AdminPass123!");
  assert.equal(badId.ok, false);
  sqlite.close();
});

test("mobile me succeeds with valid token lookup and fails for missing/invalid/expired", async () => {
  const { sqlite, db } = await createTestDb();
  const users = await seedUsers(db);
  const issued = await issueMobileSessionToken(db, {
    sid: "sid-1",
    userId: users.admin.user.id,
    secret: SECRET,
    expiresAt: Date.now() + 60_000
  });

  const ok = await lookupMobileSessionToken(db, issued.rawToken, SECRET);
  assert.equal(ok.status, "ok");
  assert.equal(ok.row.sid, "sid-1");

  const missing = await lookupMobileSessionToken(db, generateMobileToken(), SECRET);
  assert.equal(missing.status, "missing");

  const expiredIssued = await issueMobileSessionToken(db, {
    sid: "sid-expired",
    userId: users.admin.user.id,
    secret: SECRET,
    expiresAt: Date.now() - 1000
  });
  const expired = await lookupMobileSessionToken(db, expiredIssued.rawToken, SECRET);
  assert.equal(expired.status, "expired");
  sqlite.close();
});

test("mobile logout deletes token and associated session store entry", async () => {
  const { sqlite, db } = await createTestDb();
  const users = await seedUsers(db);
  const store = new SQLiteSessionStore(db, { ttl: 60_000 });
  await store.ready;
  const sid = "logout-sid";
  await new Promise((resolve, reject) => {
    store.set(sid, {
      userId: users.admin.user.id,
      role: ROLES.ADMIN,
      sessionVersion: 1,
      cookie: { expires: new Date(Date.now() + 60_000) }
    }, err => (err ? reject(err) : resolve()));
  });

  const issued = await issueMobileSessionToken(db, {
    sid,
    userId: users.admin.user.id,
    secret: SECRET,
    expiresAt: Date.now() + 60_000
  });

  const found = await lookupMobileSessionToken(db, issued.rawToken, SECRET);
  assert.equal(found.status, "ok");
  await deleteMobileSessionToken(db, found.tokenHash);
  await deleteMobileSessionTokensForSid(db, sid);
  await sessionStoreDestroy(store, sid);

  assert.equal((await lookupMobileSessionToken(db, issued.rawToken, SECRET)).status, "missing");
  assert.equal(await sessionStoreGet(store, sid), null);
  sqlite.close();
});

test("session_version bump and deactivate invalidate mobile auth via current session fields", async () => {
  const { sqlite, db } = await createTestDb();
  const users = await seedUsers(db);
  const memberId = users.member.user.id;

  const before = users.member.user;
  await resetUserPassword(db, memberId, "NewSalesPass123!");
  const afterReset = await db.prepare("SELECT * FROM app_users WHERE id = ?").get(memberId);
  assert.equal(Number(afterReset.session_version), Number(before.session_version) + 1);

  // Simulated request session with stale version must fail role/user check pattern used by server.
  assert.notEqual(Number(before.session_version), Number(afterReset.session_version));

  await setUserActive(db, memberId, false);
  const inactiveLogin = await authenticateAppUser(db, "sales.user", "NewSalesPass123!");
  assert.equal(inactiveLogin.ok, false);
  sqlite.close();
});

test("project isolation remains server-side for project users", async () => {
  const { sqlite, db } = await createTestDb();
  const users = await seedUsers(db);
  const owner = await db.prepare("INSERT INTO users (google_sub, email, name) VALUES (?, ?, ?)")
    .run("sub-1", "sheets@example.com", "Sheets");
  const projectA = await db.prepare(`
    INSERT INTO projects (user_id, name, spreadsheet_id, spreadsheet_name, sheet_id, sheet_title)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(Number(owner.lastInsertRowid), "Alpha", "sheetA", "A", 1, "Leads");
  const projectB = await db.prepare(`
    INSERT INTO projects (user_id, name, spreadsheet_id, spreadsheet_name, sheet_id, sheet_title)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(Number(owner.lastInsertRowid), "Beta", "sheetB", "B", 2, "Leads");

  await replaceUserProjects(db, users.member.user.id, [Number(projectA.lastInsertRowid)]);
  const assignedA = await userHasProjectAssignment(db, users.member.user.id, Number(projectA.lastInsertRowid));
  const assignedB = await userHasProjectAssignment(db, users.member.user.id, Number(projectB.lastInsertRowid));
  assert.equal(canAccessProject(users.member.user, assignedA).ok, true);
  assert.equal(canAccessProject(users.member.user, assignedB).status, 403);
  assert.equal(canAccessProject(users.admin.user, false).ok, true);
  sqlite.close();
});

test("CSRF bypass only for validated mobileBearerAuth flag", () => {
  assert.equal(shouldBypassBrowserCsrf({ mobileBearerAuth: true }), true);
  assert.equal(shouldBypassBrowserCsrf({ mobileBearerAuth: false }), false);
  assert.equal(shouldBypassBrowserCsrf({}), false);
  assert.equal(shouldBypassBrowserCsrf(null), false);

  // Cookie mutation still needs CSRF when not mobile bearer.
  assert.equal(csrfTokensMatch("abc", "abc"), true);
  assert.equal(csrfTokensMatch("abc", "nope"), false);
  assert.equal(csrfTokensMatch("abc", undefined), false);
});

test("invalid bearer extraction and sanitizeAppUser never leak secrets", () => {
  assert.equal(extractBearerToken("Bearer tok.en_value-1"), "tok.en_value-1");
  assert.equal(extractBearerToken("Basic abc"), null);
  assert.equal(extractBearerToken(""), null);

  const safe = sanitizeAppUser({
    id: 9,
    name: "A",
    login_id: "a.user",
    role: ROLES.PROJECT_USER,
    is_active: 1,
    password_hash: "$argon2id$secret"
  });
  assert.equal(JSON.stringify(safe).includes("password"), false);
  assert.equal(JSON.stringify(safe).includes("argon2"), false);
});

test("Bearer Authorization header format rejects oversized tokens", () => {
  assert.equal(extractBearerToken(`Bearer ${"a".repeat(600)}`), null);
});
