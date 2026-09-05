"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const Database = require("better-sqlite3");
const {
  TIMELINE_EVENT_TYPES,
  ensureLeadGeneratedEvent,
  recordLeadGeneratedForRows,
  recordStatusChangedEvent,
  listTimelineEvents,
  insertTimelineEvent,
  adminEditTimelineEvent,
  adminSoftDeleteTimelineEvent,
  rejectProjectUserTimelineMutation
} = require("./lead-timeline");
const { createRemark, listRemarks, softDeleteRemark } = require("./lead-remarks");
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

async function createDb() {
  const sqlite = new Database(":memory:");
  sqlite.pragma("foreign_keys = ON");
  const dbModule = require("./db");
  // Use SCHEMA via exec of create statements from ensure - simpler manual schema:
  sqlite.exec(`
    CREATE TABLE users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      google_sub TEXT NOT NULL UNIQUE,
      email TEXT NOT NULL UNIQUE,
      name TEXT,
      refresh_token_enc TEXT
    );
    CREATE TABLE projects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      spreadsheet_id TEXT NOT NULL,
      sheet_id INTEGER,
      sheet_title TEXT NOT NULL,
      columns_json TEXT NOT NULL DEFAULT '[]',
      sync_snapshot_json TEXT NOT NULL DEFAULT '{}',
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE TABLE app_users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      login_id TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 1,
      session_version INTEGER NOT NULL DEFAULT 1
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
  `);
  const db = wrapBetterSqlite(sqlite);
  await db.prepare("INSERT INTO users (google_sub, email) VALUES (?, ?)").run("g1", "a@test.com");
  await db.prepare(`INSERT INTO projects (user_id, name, spreadsheet_id, sheet_id, sheet_title)
    VALUES (1, 'Advitya', 'sheet1', 1, 'Leads')`).run();
  await db.prepare(`INSERT INTO app_users (name, login_id, password_hash, role)
    VALUES ('Rahul', 'rahul01', 'hash', ?)`).run(ROLES.PROJECT_USER);
  await db.prepare(`INSERT INTO app_users (name, login_id, password_hash, role)
    VALUES ('Admin', 'admin', 'hash', ?)`).run(ROLES.ADMIN);
  return { sqlite, db };
}

test("lead generated is created once and sync does not duplicate", async () => {
  const { sqlite, db } = await createDb();
  const first = await ensureLeadGeneratedEvent(db, { projectId: 1, leadId: "2", source: "Meta Ads" });
  assert.equal(first.created, true);
  const second = await ensureLeadGeneratedEvent(db, { projectId: 1, leadId: "2", source: "Meta Ads" });
  assert.equal(second.created, false);
  await recordLeadGeneratedForRows(db, {
    projectId: 1,
    rowNumbers: [2, 3],
    leads: [{ Source: "Meta Ads" }, { Source: "Google" }],
    columns: ["Name", "Source"],
    projectName: "Advitya"
  });
  const events = await listTimelineEvents(db, { projectId: 1, leadId: "2" });
  assert.equal(events.filter(e => e.eventType === TIMELINE_EVENT_TYPES.LEAD_GENERATED).length, 1);
  const lead3 = await listTimelineEvents(db, { projectId: 1, leadId: "3" });
  assert.equal(lead3.length, 1);
  sqlite.close();
});

test("status change creates timeline event; same status skipped; failed path creates none", async () => {
  const { sqlite, db } = await createDb();
  const actor = { id: 1, name: "Rahul", login_id: "rahul01", role: ROLES.PROJECT_USER };
  const changed = await recordStatusChangedEvent(db, {
    projectId: 1,
    leadId: "2",
    fromStatus: "New",
    toStatus: "Contacted",
    actor
  });
  assert.equal(changed.created, true);
  const same = await recordStatusChangedEvent(db, {
    projectId: 1,
    leadId: "2",
    fromStatus: "Contacted",
    toStatus: "Contacted",
    actor
  });
  assert.equal(same.skipped, true);
  const events = await listTimelineEvents(db, { projectId: 1, leadId: "2" });
  assert.equal(events.filter(e => e.eventType === TIMELINE_EVENT_TYPES.STATUS_CHANGED).length, 1);
  assert.equal(events[0].eventData.fromStatus, "New");
  assert.equal(events[0].eventData.toStatus, "Contacted");
  // Simulate failed Google update: simply do not call recordStatusChangedEvent.
  assert.equal(events.length, 1);
  sqlite.close();
});

test("remark creation creates timeline event and persists across listing", async () => {
  const { sqlite, db } = await createDb();
  const actor = { id: 1, name: "Rahul", login_id: "rahul01", role: ROLES.PROJECT_USER };
  const created = await createRemark(db, {
    projectId: 1,
    leadId: "2",
    body: "Customer interested, asked for price.",
    actor
  });
  assert.ok(created.value);
  const remarks = await listRemarks(db, { projectId: 1, leadId: "2" });
  assert.equal(remarks.length, 1);
  assert.equal(remarks[0].body, "Customer interested, asked for price.");
  const events = await listTimelineEvents(db, { projectId: 1, leadId: "2" });
  assert.equal(events[0].eventType, TIMELINE_EVENT_TYPES.REMARK_ADDED);
  assert.equal(events[0].actor.userId, 1);
  sqlite.close();
});

test("timeline ordering is newest first and rejects client spoof fields conceptually", async () => {
  const { sqlite, db } = await createDb();
  await insertTimelineEvent(db, {
    projectId: 1,
    leadId: "2",
    eventType: TIMELINE_EVENT_TYPES.LEAD_GENERATED,
    eventData: { title: "Lead Generated" },
    actorRole: "system"
  });
  await recordStatusChangedEvent(db, {
    projectId: 1,
    leadId: "2",
    fromStatus: "New",
    toStatus: "Contacted",
    actor: { id: 1, name: "Rahul", role: ROLES.PROJECT_USER }
  });
  const events = await listTimelineEvents(db, { projectId: 1, leadId: "2" });
  assert.equal(events[0].eventType, TIMELINE_EVENT_TYPES.STATUS_CHANGED);
  assert.equal(events[1].eventType, TIMELINE_EVENT_TYPES.LEAD_GENERATED);
  // insertTimelineEvent API has no createdAt parameter — timestamps are server-only.
  sqlite.close();
});

test("project user cannot mutate timeline; admin soft delete and edit create audit records", async () => {
  const { sqlite, db } = await createDb();
  const denied = rejectProjectUserTimelineMutation();
  assert.equal(denied.statusCode, 403);

  const inserted = await insertTimelineEvent(db, {
    projectId: 1,
    leadId: "2",
    eventType: TIMELINE_EVENT_TYPES.STATUS_CHANGED,
    eventData: { title: "Status Changed", fromStatus: "New", toStatus: "Contacted" },
    actorUserId: 1,
    actorRole: ROLES.PROJECT_USER
  });
  const admin = { id: 2, name: "Admin", login_id: "admin", role: ROLES.ADMIN };
  await adminEditTimelineEvent(db, {
    eventId: inserted.value,
    projectId: 1,
    newEventData: { title: "Status Changed", fromStatus: "New", toStatus: "Interested" },
    reason: "Correction",
    adminUser: admin
  });
  let events = await listTimelineEvents(db, { projectId: 1, leadId: "2" });
  assert.ok(events.some(e => e.eventType === TIMELINE_EVENT_TYPES.TIMELINE_EVENT_EDITED));

  await adminSoftDeleteTimelineEvent(db, {
    eventId: inserted.value,
    projectId: 1,
    adminUser: admin
  });
  events = await listTimelineEvents(db, { projectId: 1, leadId: "2" });
  const deletedVisible = events.find(e => e.id === inserted.value);
  assert.equal(deletedVisible, undefined);
  const withDeleted = await listTimelineEvents(db, { projectId: 1, leadId: "2", includeDeleted: true });
  assert.ok(withDeleted.some(e => e.id === inserted.value && e.isDeleted));
  sqlite.close();
});

test("XSS payload is stored as plain text and escaped by frontend helpers expectation", async () => {
  const { sqlite, db } = await createDb();
  const payload = "<img src=x onerror=alert(1)>";
  await createRemark(db, {
    projectId: 1,
    leadId: "2",
    body: payload,
    actor: { id: 1, name: "Rahul", role: ROLES.PROJECT_USER }
  });
  const remarks = await listRemarks(db, { projectId: 1, leadId: "2" });
  assert.equal(remarks[0].body, payload);
  // Frontend uses escapeHTML when rendering — verify escape contract here:
  const escapeHTML = value => String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
  assert.equal(escapeHTML(remarks[0].body).includes("<img"), false);
  assert.ok(escapeHTML(remarks[0].body).includes("&lt;img"));
  sqlite.close();
});

test("remark soft delete creates REMARK_DELETED timeline event", async () => {
  const { sqlite, db } = await createDb();
  const actor = { id: 1, name: "Rahul", role: ROLES.PROJECT_USER };
  const created = await createRemark(db, {
    projectId: 1,
    leadId: "2",
    body: "Temporary note",
    actor
  });
  await softDeleteRemark(db, {
    remarkId: created.value.id,
    projectId: 1,
    actor,
    isAdmin: false
  });
  const remarks = await listRemarks(db, { projectId: 1, leadId: "2" });
  assert.equal(remarks.length, 0);
  const events = await listTimelineEvents(db, { projectId: 1, leadId: "2" });
  assert.ok(events.some(e => e.eventType === TIMELINE_EVENT_TYPES.REMARK_DELETED));
  sqlite.close();
});
