"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const Database = require("better-sqlite3");
const {
  ensureAppUserSchema,
  bootstrapAdminUser,
  authenticateAppUser,
  findAppUserById
} = require("./app-users");
const { hashPassword } = require("./password");
const { ROLES } = require("./authz");
const { DELETED_DISPLAY_NAME, deleteAuthenticatedAccount } = require("./account-deletion");
const {
  ensureLoginThrottleSchema,
  assertLoginAllowed,
  recordLoginFailure,
  clearLoginThrottleOnSuccess,
  COMBO_MAX_FAILURES,
  THROTTLED_ERROR,
  GENERIC_AUTH_ERROR
} = require("./login-throttle");
const {
  ensureStatusTimelineOutboxSchema,
  recordStatusChangedAfterSheetWrite,
  flushPendingStatusTimelineForLead,
  hasTimelineEventForMutation
} = require("./status-timeline-outbox");
const { ensureStatusUpdateLockSchema, withLeadStatusLock } = require("./status-update-lock");
const { listTimelineEvents, TIMELINE_EVENT_TYPES } = require("./lead-timeline");
const {
  ensureMobileSessionTokenSchema,
  issueMobileSessionToken,
  lookupMobileSessionToken
} = require("./mobile-auth");

const SECRET = "test-session-secret-for-phase-30-2c";

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
  await ensureLoginThrottleSchema(db);
  await ensureStatusTimelineOutboxSchema(db);
  await ensureStatusUpdateLockSchema(db);
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

test("H1/M1 bootstrap never revives deleted inactive admin and bumps session_version on rewrite", async () => {
  const { db, sqlite } = await createDb();
  const hash1 = await hashPassword("AdminPass123!");
  const id1 = await bootstrapAdminUser(db, { loginId: "admin01", passwordHash: hash1 });
  const first = await findAppUserById(db, id1);
  assert.equal(first.is_active, 1);
  assert.equal(first.session_version, 1);

  // Idempotent restart with same credentials does not bump session_version.
  await bootstrapAdminUser(db, { loginId: "admin01", passwordHash: hash1 });
  const same = await findAppUserById(db, id1);
  assert.equal(same.session_version, 1);

  // Changed credentials bump session_version and invalidate mobile tokens logically.
  const issued = await issueMobileSessionToken(db, {
    sid: "sid-admin",
    userId: id1,
    secret: SECRET
  });
  assert.equal((await lookupMobileSessionToken(db, issued.rawToken, SECRET)).status, "ok");

  const hash2 = await hashPassword("AdminPass456!");
  await bootstrapAdminUser(db, { loginId: "admin01", passwordHash: hash2 });
  const rewritten = await findAppUserById(db, id1);
  assert.equal(rewritten.session_version, 2);
  assert.equal(rewritten.is_active, 1);
  // Browser/mobile auth bind sessionVersion; mismatch invalidates stale sessions.
  assert.notEqual(Number(rewritten.session_version), Number(first.session_version));
  const authOld = await authenticateAppUser(db, "admin01", "AdminPass123!");
  assert.equal(authOld.ok, false);
  const authNew = await authenticateAppUser(db, "admin01", "AdminPass456!");
  assert.equal(authNew.ok, true);

  // Create second admin, delete first, bootstrap must not revive deleted row.
  const hashOther = await hashPassword("AdminPass789!");
  await db
    .prepare(
      `INSERT INTO app_users (name, login_id, password_hash, role, is_active)
       VALUES (?, ?, ?, ?, 1)`
    )
    .run("Admin Two", "admin02", hashOther, ROLES.ADMIN);

  const deleted = await deleteAuthenticatedAccount(db, {
    user: await findAppUserById(db, id1)
  });
  assert.equal(deleted.ok, true);
  const deletedRow = await findAppUserById(db, id1);
  assert.equal(deletedRow.is_active, 0);
  assert.equal(deletedRow.name, DELETED_DISPLAY_NAME);
  assert.match(deletedRow.login_id, /^deleted_/);

  const hash3 = await hashPassword("FreshAdmin999!");
  const bootId = await bootstrapAdminUser(db, { loginId: "admin_fresh", passwordHash: hash3 });
  assert.notEqual(bootId, id1);
  const stillDeleted = await findAppUserById(db, id1);
  assert.equal(stillDeleted.is_active, 0);
  assert.match(stillDeleted.login_id, /^deleted_/);
  const revivedAuth = await authenticateAppUser(db, stillDeleted.login_id, "FreshAdmin999!");
  assert.equal(revivedAuth.ok, false);
  const fresh = await findAppUserById(db, bootId);
  assert.equal(fresh.login_id, "admin_fresh");
  assert.equal(fresh.is_active, 1);

  // Matching deleted login id must not be reused via bootstrap.
  await assert.rejects(
    () => bootstrapAdminUser(db, { loginId: stillDeleted.login_id, passwordHash: hash3 }),
    /inactive or deleted|invalid/i
  );

  sqlite.close();
});

test("M2 login throttle blocks repeated failures then recovers after success", async () => {
  const { db, sqlite } = await createDb();
  const hash = await hashPassword("UserPass123!");
  await bootstrapAdminUser(db, { loginId: "admin01", passwordHash: hash });

  const ip = "203.0.113.10";
  for (let i = 0; i < COMBO_MAX_FAILURES; i += 1) {
    const allowed = await assertLoginAllowed(db, { ip, loginId: "admin01" });
    assert.equal(allowed.ok, true);
    await recordLoginFailure(db, { ip, loginId: "admin01" });
  }
  const blocked = await assertLoginAllowed(db, { ip, loginId: "admin01" });
  assert.equal(blocked.ok, false);
  assert.equal(blocked.statusCode, 429);
  assert.equal(blocked.error, THROTTLED_ERROR);
  assert.equal(JSON.stringify(blocked).includes("password"), false);

  // Different login ID on same IP is not combo-blocked (may still hit IP later).
  const other = await assertLoginAllowed(db, { ip, loginId: "other_user" });
  assert.equal(other.ok, true);

  // Different IP same login uses separate combo bucket.
  const otherIp = await assertLoginAllowed(db, { ip: "198.51.100.20", loginId: "admin01" });
  assert.equal(otherIp.ok, true);

  await clearLoginThrottleOnSuccess(db, { ip, loginId: "admin01" });
  const recovered = await assertLoginAllowed(db, { ip, loginId: "admin01" });
  assert.equal(recovered.ok, true);
  assert.equal(GENERIC_AUTH_ERROR.includes("password"), true);
  sqlite.close();
});

test("M3 timeline outbox recovers after simulated timeline failure without duplicates", async () => {
  const { db, sqlite } = await createDb();
  const hash = await hashPassword("AdminPass123!");
  const adminId = await bootstrapAdminUser(db, { loginId: "admin01", passwordHash: hash });
  const actor = await findAppUserById(db, adminId);

  const originalInsert = db.prepare;
  let failOnce = true;
  db.prepare = sql => {
    const statement = originalInsert.call(db, sql);
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

  const first = await recordStatusChangedAfterSheetWrite(db, {
    projectId: 1,
    leadId: "5",
    fromStatus: "New",
    toStatus: "Contacted",
    actor
  });
  assert.equal(first.timelinePending, true);
  assert.equal(first.timelineRecorded, false);
  assert.ok(first.mutationId);

  db.prepare = originalInsert;

  const pending = await db
    .prepare("SELECT * FROM status_timeline_outbox WHERE completed_at IS NULL")
    .all();
  assert.equal(pending.length, 1);
  assert.equal(pending[0].idempotency_key, first.mutationId);

  const flush1 = await flushPendingStatusTimelineForLead(db, 1, "5");
  assert.equal(flush1.some(item => item.flushed), true);

  const events = await listTimelineEvents(db, { projectId: 1, leadId: "5" });
  const statusEvents = events.filter(e => e.eventType === TIMELINE_EVENT_TYPES.STATUS_CHANGED);
  assert.equal(statusEvents.length, 1);
  assert.equal(statusEvents[0].eventData.mutationId, first.mutationId);

  const flush2 = await flushPendingStatusTimelineForLead(db, 1, "5");
  assert.ok(Array.isArray(flush2));
  assert.equal(
    (await listTimelineEvents(db, { projectId: 1, leadId: "5" })).filter(
      e => e.eventType === TIMELINE_EVENT_TYPES.STATUS_CHANGED
    ).length,
    1
  );

  // A later independent A→B mutation must create a NEW event (not suppressed).
  const second = await recordStatusChangedAfterSheetWrite(db, {
    projectId: 1,
    leadId: "5",
    fromStatus: "New",
    toStatus: "Contacted",
    actor
  });
  assert.equal(second.timelineRecorded, true);
  assert.notEqual(second.mutationId, first.mutationId);
  assert.equal(
    (await listTimelineEvents(db, { projectId: 1, leadId: "5" })).filter(
      e => e.eventType === TIMELINE_EVENT_TYPES.STATUS_CHANGED
    ).length,
    2
  );
  assert.equal(
    await hasTimelineEventForMutation(db, {
      projectId: 1,
      leadId: "5",
      mutationId: first.mutationId
    }),
    true
  );
  assert.equal(
    await hasTimelineEventForMutation(db, {
      projectId: 1,
      leadId: "5",
      mutationId: second.mutationId
    }),
    true
  );
  sqlite.close();
});

test("M4 lead status lock serializes concurrent critical sections", async () => {
  const { db, sqlite } = await createDb();
  const order = [];
  const first = withLeadStatusLock(db, 9, 5, async () => {
    order.push("a-start");
    await new Promise(r => setTimeout(r, 40));
    order.push("a-end");
    return "a";
  });
  const second = withLeadStatusLock(db, 9, 5, async () => {
    order.push("b-start");
    order.push("b-end");
    return "b";
  });
  const third = withLeadStatusLock(db, 9, 6, async () => {
    order.push("c");
    return "c";
  });
  const results = await Promise.all([first, second, third]);
  assert.deepEqual(results, ["a", "b", "c"]);
  assert.deepEqual(order.slice(0, 2), ["a-start", "c"]);
  assert.ok(order.indexOf("a-end") < order.indexOf("b-start"));
  sqlite.close();
});

test("M8 screen capture docs and component describe fail-open behavior", () => {
  const component = fs.readFileSync(
    path.join(__dirname, "mobile/components/ScreenCaptureProtection.tsx"),
    "utf8"
  );
  assert.match(component, /fail-open/i);
  assert.doesNotMatch(component, /fail closed quietly/);
  assert.match(component, /__DEV__/);
  assert.match(component, /useMountedRef|preventScreenCaptureAsync/);
});

test("M7 mounted ref hook exists and screens import it", () => {
  const hook = fs.readFileSync(path.join(__dirname, "mobile/hooks/useMountedRef.ts"), "utf8");
  assert.match(hook, /mountedRef\.current = false/);
  for (const rel of [
    "mobile/app/(app)/more.tsx",
    "mobile/app/(app)/index.tsx",
    "mobile/app/(app)/projects/index.tsx",
    "mobile/app/(app)/search.tsx",
    "mobile/app/(app)/projects/new.tsx",
    "mobile/app/(app)/projects/[projectId]/lead/[rowNumber].tsx"
  ]) {
    const src = fs.readFileSync(path.join(__dirname, rel), "utf8");
    assert.match(src, /useMountedRef/);
    assert.match(src, /mountedRef\.current/);
  }
});

test("identity and EAS project remain unchanged after hardening", () => {
  const appJson = JSON.parse(fs.readFileSync(path.join(__dirname, "mobile/app.json"), "utf8"));
  assert.equal(appJson.expo.name, "Website CRM");
  assert.equal(appJson.expo.slug, "chaturx");
  assert.equal(appJson.expo.owner, "sainiankush16s-team");
  assert.equal(appJson.expo.extra.eas.projectId, "371610cf-f7db-4582-a68f-bf5ae57741cd");
  assert.equal(appJson.expo.android.package, "com.chaturx.leads");
  assert.equal(appJson.expo.ios.bundleIdentifier, "com.chaturx.leads");
});
