"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const Database = require("better-sqlite3");
const fs = require("node:fs");
const path = require("node:path");
const {
  MAX_REMARK_LENGTH,
  validateRemarkBody,
  createRemark,
  editRemark,
  softDeleteRemark,
  listRemarks
} = require("./lead-remarks");
const { listTimelineEvents, TIMELINE_EVENT_TYPES } = require("./lead-timeline");
const {
  canAccessProject,
  resolveAuthenticatedUser,
  ROLES
} = require("./authz");
const { shouldBypassBrowserCsrf, csrfTokensMatch } = require("./api-guards");

function wrapBetterSqlite(sqlite) {
  return {
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

function createMemoryDb() {
  const sqlite = new Database(":memory:");
  sqlite.exec(`
    CREATE TABLE app_users (
      id INTEGER PRIMARY KEY,
      name TEXT,
      login_id TEXT,
      role TEXT,
      is_active INTEGER
    );
    CREATE TABLE lead_remarks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL,
      lead_id TEXT NOT NULL,
      body TEXT NOT NULL,
      author_user_id INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      is_deleted INTEGER NOT NULL DEFAULT 0,
      deleted_by INTEGER,
      deleted_at TEXT
    );
    CREATE TABLE lead_timeline_events (
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
      deleted_at TEXT
    );
  `);
  return { sqlite, db: wrapBetterSqlite(sqlite) };
}

test("remark body validation rejects empty and whitespace-only text", () => {
  assert.equal(validateRemarkBody("").error, "Remark text is required.");
  assert.equal(validateRemarkBody("   ").error, "Remark text is required.");
  assert.equal(validateRemarkBody(null).error, "Remark text is required.");
  assert.deepEqual(validateRemarkBody("  Hello  "), { value: "Hello" });
  assert.ok(validateRemarkBody("x".repeat(MAX_REMARK_LENGTH + 1)).error);
});

test("create remark uses authenticated actor and creates REMARK_ADDED", async () => {
  const { sqlite, db } = createMemoryDb();
  const actor = { id: 7, name: "Anshul", login_id: "anshul", role: ROLES.PROJECT_USER };
  const created = await createRemark(db, {
    projectId: 3,
    leadId: "12",
    body: "Called customer.",
    actor
  });
  assert.equal(created.value.author.userId, 7);
  assert.equal(created.value.body, "Called customer.");
  assert.ok(created.value.createdAt);
  const events = await listTimelineEvents(db, { projectId: 3, leadId: "12" });
  assert.equal(events[0].eventType, TIMELINE_EVENT_TYPES.REMARK_ADDED);
  assert.equal(events[0].actor.userId, 7);
  assert.equal(events[0].eventData.remarkId, created.value.id);
  sqlite.close();
});

test("edit permission: author and admin only; creates REMARK_EDITED", async () => {
  const { sqlite, db } = createMemoryDb();
  const author = { id: 2, name: "John", login_id: "john", role: ROLES.PROJECT_USER };
  const other = { id: 3, name: "Other", login_id: "other", role: ROLES.PROJECT_USER };
  const admin = { id: 1, name: "Admin", login_id: "admin", role: ROLES.ADMIN };
  const created = await createRemark(db, {
    projectId: 1,
    leadId: "5",
    body: "Original",
    actor: author
  });
  const denied = await editRemark(db, {
    remarkId: created.value.id,
    projectId: 1,
    body: "Nope",
    actor: other,
    isAdmin: false
  });
  assert.equal(denied.statusCode, 403);
  const edited = await editRemark(db, {
    remarkId: created.value.id,
    projectId: 1,
    body: "Updated by author",
    actor: author,
    isAdmin: false
  });
  assert.equal(edited.value.body, "Updated by author");
  const adminEdit = await editRemark(db, {
    remarkId: created.value.id,
    projectId: 1,
    body: "Updated by admin",
    actor: admin,
    isAdmin: true
  });
  assert.equal(adminEdit.value.body, "Updated by admin");
  const events = await listTimelineEvents(db, { projectId: 1, leadId: "5" });
  assert.ok(events.some(e => e.eventType === TIMELINE_EVENT_TYPES.REMARK_EDITED));
  sqlite.close();
});

test("soft delete hides remark and creates REMARK_DELETED", async () => {
  const { sqlite, db } = createMemoryDb();
  const author = { id: 2, name: "John", login_id: "john", role: ROLES.PROJECT_USER };
  const created = await createRemark(db, {
    projectId: 1,
    leadId: "5",
    body: "To delete",
    actor: author
  });
  const deleted = await softDeleteRemark(db, {
    remarkId: created.value.id,
    projectId: 1,
    actor: author,
    isAdmin: false
  });
  assert.equal(deleted.value, true);
  const remarks = await listRemarks(db, { projectId: 1, leadId: "5" });
  assert.equal(remarks.length, 0);
  const events = await listTimelineEvents(db, { projectId: 1, leadId: "5" });
  assert.ok(events.some(e => e.eventType === TIMELINE_EVENT_TYPES.REMARK_DELETED));
  sqlite.close();
});

test("invalid lead id rejected on create", async () => {
  const { sqlite, db } = createMemoryDb();
  const result = await createRemark(db, {
    projectId: 1,
    leadId: "",
    body: "x",
    actor: { id: 1, role: ROLES.ADMIN, name: "A", login_id: "a" }
  });
  assert.equal(result.statusCode, 400);
  sqlite.close();
});

test("project authorization helpers and auth gates remain strict", () => {
  const member = { id: 2, role: ROLES.PROJECT_USER, is_active: 1 };
  assert.equal(canAccessProject(member, true).ok, true);
  assert.equal(canAccessProject(member, false).status, 403);
  assert.equal(resolveAuthenticatedUser(null).status, 401);
  assert.equal(resolveAuthenticatedUser({ role: ROLES.ADMIN, is_active: 0 }).status, 401);
});

test("remarks routes reuse requireAuth/csrf and reject spoofed actor fields", () => {
  const source = fs.readFileSync(path.join(__dirname, "server.js"), "utf8");
  assert.match(source, /app\.get\("\/api\/projects\/:id\/leads\/:leadId\/remarks", requireAuth/);
  assert.match(source, /app\.post\("\/api\/projects\/:id\/leads\/:leadId\/remarks", requireAuth, csrfProtection/);
  assert.match(source, /app\.patch\("\/api\/projects\/:id\/remarks\/:remarkId", requireAuth, csrfProtection/);
  assert.match(source, /app\.delete\("\/api\/projects\/:id\/remarks\/:remarkId", requireAuth, csrfProtection/);
  assert.match(source, /actorUserId/);
  assert.match(source, /createRemark\(db,/);
  assert.match(source, /editRemark\(db,/);
  assert.match(source, /softDeleteRemark\(db,/);
  assert.match(source, /actor: req\.user/);
  assert.equal(shouldBypassBrowserCsrf({ mobileBearerAuth: true }), true);
  assert.equal(shouldBypassBrowserCsrf({}), false);
  assert.equal(csrfTokensMatch("a", "a"), true);
  assert.equal(csrfTokensMatch("a", "b"), false);
});
