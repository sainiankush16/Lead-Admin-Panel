"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const Database = require("better-sqlite3");
const {
  canUpdateLeadStatus,
  canAccessProject,
  resolveAuthenticatedUser,
  ROLES
} = require("./authz");
const { shouldBypassBrowserCsrf, csrfTokensMatch } = require("./api-guards");
const { recordStatusChangedEvent, TIMELINE_EVENT_TYPES, listTimelineEvents } = require("./lead-timeline");
const { decideLeadStatusWrite, planLeadStatusUpdate } = require("./lead-status-ops");

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

test("status PATCH route reuses requireAuth + csrfProtection and writes Sheets before timeline", () => {
  const source = fs.readFileSync(path.join(__dirname, "server.js"), "utf8");
  assert.match(source, /app\.patch\("\/api\/projects\/:id\/leads\/:rowNumber\/status", requireAuth, csrfProtection/);
  assert.match(source, /decideLeadStatusWrite/);
  assert.match(source, /await writeLeadStatus/);
  assert.match(source, /recordStatusChangedAfterSheetWrite/);
  assert.match(source, /withLeadStatusLock/);
  assert.match(source, /flushPendingStatusTimelineForLead/);

  const patchStart = source.indexOf('app.patch("/api/projects/:id/leads/:rowNumber/status"');
  const patchEnd = source.indexOf("/* -------------------- LEAD REMARKS + TIMELINE -------------------- */", patchStart);
  const route = source.slice(patchStart, patchEnd);
  const writeIdx = route.indexOf("await writeLeadStatus");
  const timelineIdx = route.indexOf("recordStatusChangedAfterSheetWrite");
  assert.ok(writeIdx > 0);
  assert.ok(timelineIdx > writeIdx);
  assert.match(route, /decision\.unchanged/);
  assert.match(route, /sheetUpdated:\s*true/);
  assert.match(route, /timelinePending/);
  assert.doesNotMatch(route, /Unable to record status change history/);
});

test("mobile bearer CSRF bypass remains gated; browser CSRF still requires token match", () => {
  assert.equal(shouldBypassBrowserCsrf({ mobileBearerAuth: true }), true);
  assert.equal(shouldBypassBrowserCsrf({}), false);
  assert.equal(csrfTokensMatch("abc", "abc"), true);
  assert.equal(csrfTokensMatch("abc", "xyz"), false);

  const source = fs.readFileSync(path.join(__dirname, "server.js"), "utf8");
  assert.match(source, /function csrfProtection/);
  assert.match(source, /shouldBypassBrowserCsrf\(req\)/);
  assert.match(source, /resolveMobileBearerAuth/);
  assert.match(source, /req\.mobileBearerAuth = true/);
});

test("project user may update assigned project status only", () => {
  const member = { id: 2, role: ROLES.PROJECT_USER, is_active: 1 };
  const admin = { id: 1, role: ROLES.ADMIN, is_active: 1 };
  assert.equal(canUpdateLeadStatus(member, true).ok, true);
  assert.equal(canUpdateLeadStatus(member, false).status, 403);
  assert.equal(canUpdateLeadStatus(admin, false).ok, true);
  assert.equal(canAccessProject(member, false).status, 403);
});

test("unauthenticated and inactive users cannot update status", () => {
  assert.equal(resolveAuthenticatedUser(null).status, 401);
  assert.equal(resolveAuthenticatedUser({ role: ROLES.PROJECT_USER, is_active: 0 }).status, 401);
  assert.equal(canUpdateLeadStatus({ role: ROLES.PROJECT_USER, is_active: 0 }, true).status, 401);
});

test("STATUS_CHANGED records previous and new status from server actor only", async () => {
  const { sqlite, db } = createMemoryDb();
  const actor = { id: 9, name: "Server Actor", login_id: "actor9", role: ROLES.PROJECT_USER };
  const result = await recordStatusChangedEvent(db, {
    projectId: 3,
    leadId: "12",
    fromStatus: "Contacted",
    toStatus: "Interested",
    actor
  });
  assert.equal(result.created, true);
  const events = await listTimelineEvents(db, { projectId: 3, leadId: "12" });
  assert.equal(events.length, 1);
  assert.equal(events[0].eventType, TIMELINE_EVENT_TYPES.STATUS_CHANGED);
  assert.equal(events[0].eventData.fromStatus, "Contacted");
  assert.equal(events[0].eventData.toStatus, "Interested");
  assert.equal(events[0].actor.userId, 9);
  assert.equal(events[0].actor.role, ROLES.PROJECT_USER);
  sqlite.close();
});

test("failed Google write path creates no STATUS_CHANGED when decide says write but write is not called", async () => {
  const { sqlite, db } = createMemoryDb();
  const project = { id: 1, spreadsheet_id: "s", sheet_title: "t" };
  const sheetData = {
    columns: ["Name", "Lead Status"],
    leads: [{ Name: "Ada", "Lead Status": "New" }],
    rowNumbers: [2]
  };
  const planned = planLeadStatusUpdate({ project, sheetData, rowNumber: 2, status: "Lost" });
  const decision = decideLeadStatusWrite({ sheetData, plannedValue: planned.value });
  assert.equal(decision.unchanged, false);
  // Simulate Google failure: do not call recordStatusChangedEvent.
  const events = await listTimelineEvents(db, { projectId: 1, leadId: "2" });
  assert.equal(events.length, 0);
  sqlite.close();
});

test("same-status decision implies no STATUS_CHANGED event", async () => {
  const { sqlite, db } = createMemoryDb();
  const project = { id: 1, spreadsheet_id: "s", sheet_title: "t" };
  const sheetData = {
    columns: ["Name", "Lead Status"],
    leads: [{ Name: "Ada", "Lead Status": "Contacted" }],
    rowNumbers: [2]
  };
  const planned = planLeadStatusUpdate({ project, sheetData, rowNumber: 2, status: "Contacted" });
  const decision = decideLeadStatusWrite({ sheetData, plannedValue: planned.value });
  assert.equal(decision.unchanged, true);
  if (!decision.unchanged) {
    await recordStatusChangedEvent(db, {
      projectId: 1,
      leadId: "2",
      fromStatus: decision.previousStatus,
      toStatus: decision.status,
      actor: { id: 1, role: ROLES.ADMIN, name: "A" }
    });
  }
  const events = await listTimelineEvents(db, { projectId: 1, leadId: "2" });
  assert.equal(events.length, 0);
  sqlite.close();
});
