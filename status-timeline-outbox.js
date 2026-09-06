"use strict";

const crypto = require("crypto");
const { TIMELINE_EVENT_TYPES, recordStatusChangedEvent } = require("./lead-timeline");

async function ensureStatusTimelineOutboxSchema(db) {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS status_timeline_outbox (
      idempotency_key TEXT PRIMARY KEY,
      project_id INTEGER NOT NULL,
      lead_id TEXT NOT NULL,
      from_status TEXT,
      to_status TEXT NOT NULL,
      actor_user_id INTEGER,
      actor_role TEXT,
      actor_label TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      completed_at TEXT,
      attempts INTEGER NOT NULL DEFAULT 0,
      last_error TEXT
    );
    CREATE INDEX IF NOT EXISTS status_timeline_outbox_pending_idx
      ON status_timeline_outbox(project_id, lead_id, completed_at);
  `);
}

/**
 * Per-mutation identity. Stable only for one logical Sheets write + its retries.
 * Never derived from fromStatus/toStatus alone.
 */
function createStatusMutationId() {
  if (typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return crypto.randomBytes(16).toString("hex");
}

async function hasTimelineEventForMutation(db, { projectId, leadId, mutationId }) {
  const target = String(mutationId || "");
  if (!target) return false;

  const rows = await db
    .prepare(
      `SELECT id, event_data FROM lead_timeline_events
       WHERE project_id = ?
         AND lead_id = ?
         AND event_type = ?
         AND is_deleted = 0
       ORDER BY id DESC
       LIMIT 50`
    )
    .all(projectId, String(leadId), TIMELINE_EVENT_TYPES.STATUS_CHANGED);

  for (const row of rows || []) {
    let data = {};
    try {
      data = JSON.parse(row.event_data || "{}");
    } catch {
      data = {};
    }
    if (String(data.mutationId || "") === target) {
      return true;
    }
  }
  return false;
}

async function insertPendingStatusTimeline(db, payload) {
  const key = String(payload.mutationId);
  await db
    .prepare(
      `INSERT INTO status_timeline_outbox (
         idempotency_key, project_id, lead_id, from_status, to_status,
         actor_user_id, actor_role, actor_label, attempts, last_error, completed_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, NULL, NULL)`
    )
    .run(
      key,
      payload.projectId,
      String(payload.leadId),
      payload.fromStatus == null ? null : String(payload.fromStatus),
      String(payload.toStatus),
      payload.actorUserId ?? null,
      payload.actorRole ?? null,
      payload.actorLabel ?? null
    );
  return key;
}

async function markStatusTimelineOutboxComplete(db, idempotencyKey) {
  await db
    .prepare(
      `UPDATE status_timeline_outbox
       SET completed_at = CURRENT_TIMESTAMP, last_error = NULL
       WHERE idempotency_key = ?`
    )
    .run(idempotencyKey);
}

async function markStatusTimelineOutboxFailure(db, idempotencyKey, error) {
  await db
    .prepare(
      `UPDATE status_timeline_outbox
       SET attempts = attempts + 1,
           last_error = ?
       WHERE idempotency_key = ?
         AND completed_at IS NULL`
    )
    .run(String(error || "timeline_failed").slice(0, 500), idempotencyKey);
}

async function flushStatusTimelineOutboxEntry(db, row) {
  if (!row || row.completed_at) return { flushed: false, alreadyComplete: true };

  const mutationId = String(row.idempotency_key);
  const payload = {
    projectId: row.project_id,
    leadId: row.lead_id,
    fromStatus: row.from_status,
    toStatus: row.to_status,
    mutationId,
    actor: {
      id: row.actor_user_id,
      role: row.actor_role,
      name: row.actor_label,
      login_id: row.actor_label
    }
  };

  // Same mutation already recorded (e.g. crash after insert before mark-complete).
  if (
    await hasTimelineEventForMutation(db, {
      projectId: payload.projectId,
      leadId: payload.leadId,
      mutationId
    })
  ) {
    await markStatusTimelineOutboxComplete(db, mutationId);
    return { flushed: true, duplicatePrevented: true, mutationId };
  }

  try {
    const recorded = await recordStatusChangedEvent(db, payload);
    if (recorded.error) throw new Error(recorded.error);
    await markStatusTimelineOutboxComplete(db, mutationId);
    return {
      flushed: true,
      created: Boolean(recorded.created),
      skipped: Boolean(recorded.skipped),
      mutationId
    };
  } catch (err) {
    await markStatusTimelineOutboxFailure(db, mutationId, err?.message || err);
    return { flushed: false, error: err, mutationId };
  }
}

async function flushPendingStatusTimelineForLead(db, projectId, leadId) {
  const rows = await db
    .prepare(
      `SELECT * FROM status_timeline_outbox
       WHERE project_id = ?
         AND lead_id = ?
         AND completed_at IS NULL
       ORDER BY created_at ASC, idempotency_key ASC`
    )
    .all(projectId, String(leadId));

  const results = [];
  for (const row of rows || []) {
    results.push(await flushStatusTimelineOutboxEntry(db, row));
  }
  return results;
}

/**
 * After a successful Sheets write: create a NEW mutation identity and ensure
 * exactly one STATUS_CHANGED event is recorded for that mutation.
 * On timeline failure, keep that pending outbox row for retry.
 */
async function recordStatusChangedAfterSheetWrite(db, {
  projectId,
  leadId,
  fromStatus,
  toStatus,
  actor,
  mutationId: providedMutationId = null
}) {
  const mutationId = providedMutationId ? String(providedMutationId) : createStatusMutationId();

  const payload = {
    mutationId,
    projectId,
    leadId,
    fromStatus,
    toStatus,
    actorUserId: actor?.id ?? null,
    actorRole: actor?.role ?? null,
    actorLabel: actor?.name || actor?.login_id || "User"
  };

  await insertPendingStatusTimeline(db, payload);

  if (
    await hasTimelineEventForMutation(db, {
      projectId,
      leadId,
      mutationId
    })
  ) {
    await markStatusTimelineOutboxComplete(db, mutationId);
    return {
      timelineRecorded: true,
      timelinePending: false,
      created: false,
      duplicatePrevented: true,
      mutationId
    };
  }

  try {
    const recorded = await recordStatusChangedEvent(db, {
      projectId,
      leadId,
      fromStatus,
      toStatus,
      actor,
      mutationId
    });
    if (recorded.error) throw new Error(recorded.error);
    await markStatusTimelineOutboxComplete(db, mutationId);
    return {
      timelineRecorded: true,
      timelinePending: false,
      created: Boolean(recorded.created),
      skipped: Boolean(recorded.skipped),
      mutationId
    };
  } catch (err) {
    await markStatusTimelineOutboxFailure(db, mutationId, err?.message || err);
    return {
      timelineRecorded: false,
      timelinePending: true,
      error: err,
      mutationId
    };
  }
}

module.exports = {
  ensureStatusTimelineOutboxSchema,
  createStatusMutationId,
  hasTimelineEventForMutation,
  insertPendingStatusTimeline,
  markStatusTimelineOutboxComplete,
  markStatusTimelineOutboxFailure,
  flushStatusTimelineOutboxEntry,
  flushPendingStatusTimelineForLead,
  recordStatusChangedAfterSheetWrite
};
