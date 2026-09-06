"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const Database = require("better-sqlite3");
const {
  ensureAppUserSchema,
  bootstrapAdminUser,
  findAppUserById
} = require("./app-users");
const { hashPassword } = require("./password");
const {
  ensureStatusTimelineOutboxSchema,
  createStatusMutationId,
  recordStatusChangedAfterSheetWrite,
  flushPendingStatusTimelineForLead,
  hasTimelineEventForMutation
} = require("./status-timeline-outbox");
const { listTimelineEvents, TIMELINE_EVENT_TYPES, recordStatusChangedEvent } = require("./lead-timeline");
const {
  afterSuccessfulServerAccountDeletion
} = require("./mobile/utils/accountSettingsCore.js");

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
  const db = wrapBetterSqlite(sqlite);
  await ensureAppUserSchema(db);
  await ensureStatusTimelineOutboxSchema(db);
  await db.exec(`
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
      deleted_at TEXT
    );
  `);
  return { sqlite, db };
}

async function countStatusEvents(db, projectId, leadId) {
  const events = await listTimelineEvents(db, { projectId, leadId });
  return events.filter(e => e.eventType === TIMELINE_EVENT_TYPES.STATUS_CHANGED).length;
}

test("M3.1 A→B creates one timeline event with mutation id", async () => {
  const { db, sqlite } = await createDb();
  const actor = await findAppUserById(
    db,
    await bootstrapAdminUser(db, {
      loginId: "admin01",
      passwordHash: await hashPassword("AdminPass123!")
    })
  );

  const result = await recordStatusChangedAfterSheetWrite(db, {
    projectId: 1,
    leadId: "10",
    fromStatus: "New",
    toStatus: "Contacted",
    actor
  });
  assert.equal(result.timelineRecorded, true);
  assert.equal(result.timelinePending, false);
  assert.ok(result.mutationId);
  assert.equal(await countStatusEvents(db, 1, "10"), 1);
  assert.equal(
    await hasTimelineEventForMutation(db, {
      projectId: 1,
      leadId: "10",
      mutationId: result.mutationId
    }),
    true
  );
  sqlite.close();
});

test("M3.2–4 timeline failure leaves one pending mutation; flush is idempotent", async () => {
  const { db, sqlite } = await createDb();
  const actor = await findAppUserById(
    db,
    await bootstrapAdminUser(db, {
      loginId: "admin01",
      passwordHash: await hashPassword("AdminPass123!")
    })
  );

  const originalPrepare = db.prepare;
  let failOnce = true;
  db.prepare = sql => {
    const statement = originalPrepare.call(db, sql);
    if (failOnce && String(sql).includes("INSERT INTO lead_timeline_events")) {
      return {
        async run() {
          failOnce = false;
          throw new Error("simulated timeline failure");
        },
        get: statement.get.bind(statement),
        all: statement.all.bind(statement)
      };
    }
    return statement;
  };

  const pendingWrite = await recordStatusChangedAfterSheetWrite(db, {
    projectId: 2,
    leadId: "7",
    fromStatus: "New",
    toStatus: "Contacted",
    actor
  });
  assert.equal(pendingWrite.timelinePending, true);
  assert.equal(await countStatusEvents(db, 2, "7"), 0);

  const pendingRows = await db
    .prepare("SELECT * FROM status_timeline_outbox WHERE completed_at IS NULL")
    .all();
  assert.equal(pendingRows.length, 1);
  assert.equal(pendingRows[0].idempotency_key, pendingWrite.mutationId);
  assert.equal(pendingRows[0].project_id, 2);
  assert.equal(pendingRows[0].lead_id, "7");

  db.prepare = originalPrepare;

  const flush1 = await flushPendingStatusTimelineForLead(db, 2, "7");
  assert.equal(flush1.some(r => r.flushed && r.created), true);
  assert.equal(await countStatusEvents(db, 2, "7"), 1);

  const flush2 = await flushPendingStatusTimelineForLead(db, 2, "7");
  assert.ok(Array.isArray(flush2));
  assert.equal(await countStatusEvents(db, 2, "7"), 1);

  const flush3 = await flushPendingStatusTimelineForLead(db, 2, "7");
  assert.ok(Array.isArray(flush3));
  assert.equal(await countStatusEvents(db, 2, "7"), 1);

  const completed = await db
    .prepare("SELECT completed_at FROM status_timeline_outbox WHERE idempotency_key = ?")
    .get(pendingWrite.mutationId);
  assert.ok(completed.completed_at);
  sqlite.close();
});

test("M3.5–7 cyclic and repeated A→B transitions each get their own event", async () => {
  const { db, sqlite } = await createDb();
  const actor = await findAppUserById(
    db,
    await bootstrapAdminUser(db, {
      loginId: "admin01",
      passwordHash: await hashPassword("AdminPass123!")
    })
  );

  const ab1 = await recordStatusChangedAfterSheetWrite(db, {
    projectId: 3,
    leadId: "4",
    fromStatus: "New",
    toStatus: "Contacted",
    actor
  });
  const ba = await recordStatusChangedAfterSheetWrite(db, {
    projectId: 3,
    leadId: "4",
    fromStatus: "Contacted",
    toStatus: "New",
    actor
  });
  assert.equal(await countStatusEvents(db, 3, "4"), 2);

  const ab2 = await recordStatusChangedAfterSheetWrite(db, {
    projectId: 3,
    leadId: "4",
    fromStatus: "New",
    toStatus: "Contacted",
    actor
  });
  assert.equal(await countStatusEvents(db, 3, "4"), 3);
  assert.notEqual(ab1.mutationId, ab2.mutationId);
  assert.notEqual(ab1.mutationId, ba.mutationId);

  const ab3 = await recordStatusChangedAfterSheetWrite(db, {
    projectId: 3,
    leadId: "4",
    fromStatus: "New",
    toStatus: "Contacted",
    actor
  });
  assert.equal(await countStatusEvents(db, 3, "4"), 4);
  assert.notEqual(ab3.mutationId, ab2.mutationId);
  sqlite.close();
});

test("M3.8 same-status recordStatusChangedEvent skips without outbox", async () => {
  const { db, sqlite } = await createDb();
  const actor = await findAppUserById(
    db,
    await bootstrapAdminUser(db, {
      loginId: "admin01",
      passwordHash: await hashPassword("AdminPass123!")
    })
  );
  const skipped = await recordStatusChangedEvent(db, {
    projectId: 1,
    leadId: "9",
    fromStatus: "Contacted",
    toStatus: "Contacted",
    actor
  });
  assert.equal(skipped.skipped, true);
  assert.equal(await countStatusEvents(db, 1, "9"), 0);
  const pending = await db.prepare("SELECT COUNT(*) AS c FROM status_timeline_outbox").get();
  assert.equal(Number(pending.c), 0);
  sqlite.close();
});

test("M3.9–11 project/lead scoping and mutation identity isolation", async () => {
  const { db, sqlite } = await createDb();
  const actor = await findAppUserById(
    db,
    await bootstrapAdminUser(db, {
      loginId: "admin01",
      passwordHash: await hashPassword("AdminPass123!")
    })
  );

  const originalPrepare = db.prepare;
  const failFor = new Set();
  db.prepare = sql => {
    const statement = originalPrepare.call(db, sql);
    if (String(sql).includes("INSERT INTO lead_timeline_events")) {
      return {
        async run(...params) {
          const leadId = String(params[1]);
          if (failFor.has(leadId)) {
            failFor.delete(leadId);
            throw new Error(`simulated failure for lead ${leadId}`);
          }
          return statement.run(...params);
        },
        get: statement.get.bind(statement),
        all: statement.all.bind(statement)
      };
    }
    return statement;
  };

  failFor.add("100");
  failFor.add("200");
  const p1 = await recordStatusChangedAfterSheetWrite(db, {
    projectId: 11,
    leadId: "100",
    fromStatus: "New",
    toStatus: "Follow Up",
    actor
  });
  const p2 = await recordStatusChangedAfterSheetWrite(db, {
    projectId: 11,
    leadId: "200",
    fromStatus: "New",
    toStatus: "Follow Up",
    actor
  });
  assert.equal(p1.timelinePending, true);
  assert.equal(p2.timelinePending, true);
  assert.notEqual(p1.mutationId, p2.mutationId);

  db.prepare = originalPrepare;

  await flushPendingStatusTimelineForLead(db, 11, "100");
  assert.equal(await countStatusEvents(db, 11, "100"), 1);
  assert.equal(await countStatusEvents(db, 11, "200"), 0);

  await flushPendingStatusTimelineForLead(db, 11, "200");
  assert.equal(await countStatusEvents(db, 11, "200"), 1);

  // Re-open the same pending mutation after event already exists → duplicatePrevented, still one event.
  await db
    .prepare("UPDATE status_timeline_outbox SET completed_at = NULL WHERE idempotency_key = ?")
    .run(p1.mutationId);
  const reflush = await flushPendingStatusTimelineForLead(db, 11, "100");
  assert.equal(reflush.some(r => r.duplicatePrevented), true);
  assert.equal(await countStatusEvents(db, 11, "100"), 1);

  // New mutation id with same from/to still creates a new event.
  const fresh = await recordStatusChangedAfterSheetWrite(db, {
    projectId: 11,
    leadId: "100",
    fromStatus: "New",
    toStatus: "Follow Up",
    actor
  });
  assert.notEqual(fresh.mutationId, p1.mutationId);
  assert.equal(await countStatusEvents(db, 11, "100"), 2);

  assert.ok(createStatusMutationId());
  assert.notEqual(createStatusMutationId(), createStatusMutationId());
  sqlite.close();
});

test("M7 afterSuccessfulServerAccountDeletion always clears credentials", async () => {
  let cleared = 0;
  let uiCalls = 0;

  const mounted = await afterSuccessfulServerAccountDeletion({
    clearLocalCredentials: async () => {
      cleared += 1;
    },
    isMounted: () => true,
    onSuccessUi: async () => {
      uiCalls += 1;
    }
  });
  assert.equal(mounted.credentialsCleared, true);
  assert.equal(mounted.uiShown, true);
  assert.equal(cleared, 1);
  assert.equal(uiCalls, 1);

  cleared = 0;
  uiCalls = 0;
  const unmounted = await afterSuccessfulServerAccountDeletion({
    clearLocalCredentials: async () => {
      cleared += 1;
    },
    isMounted: () => false,
    onSuccessUi: async () => {
      uiCalls += 1;
    }
  });
  assert.equal(unmounted.credentialsCleared, true);
  assert.equal(unmounted.uiShown, false);
  assert.equal(cleared, 1);
  assert.equal(uiCalls, 0);
});

test("M7 More screen wires delete success cleanup before mounted-only UI", () => {
  const more = fs.readFileSync(path.join(__dirname, "mobile/app/(app)/more.tsx"), "utf8");
  assert.match(more, /afterSuccessfulServerAccountDeletion/);
  assert.match(more, /clearLocalCredentials:\s*\(\)\s*=>\s*logout\(\)/);

  const deleteFnStart = more.indexOf("async function runDeleteAccount");
  const deleteFn = more.slice(deleteFnStart, more.indexOf("const actionBusy", deleteFnStart));
  const deleteAccountIdx = deleteFn.indexOf("api.deleteAccount()");
  const cleanupIdx = deleteFn.indexOf("afterSuccessfulServerAccountDeletion");
  const catchIdx = deleteFn.indexOf("} catch");
  assert.ok(deleteAccountIdx >= 0);
  assert.ok(cleanupIdx > deleteAccountIdx);
  assert.ok(cleanupIdx < catchIdx);
  // Failure path must not clear credentials via the success helper.
  const catchBlock = deleteFn.slice(catchIdx);
  assert.doesNotMatch(catchBlock, /afterSuccessfulServerAccountDeletion|clearLocalCredentials/);
  assert.doesNotMatch(catchBlock, /await logout\(\)/);
});

test("M7 account settings export remains available for More screen", () => {
  const ts = fs.readFileSync(path.join(__dirname, "mobile/utils/accountSettings.ts"), "utf8");
  assert.match(ts, /afterSuccessfulServerAccountDeletion/);
});
