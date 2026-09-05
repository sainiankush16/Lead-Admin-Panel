"use strict";

const TIMELINE_EVENT_TYPES = Object.freeze({
  LEAD_GENERATED: "LEAD_GENERATED",
  STATUS_CHANGED: "STATUS_CHANGED",
  REMARK_ADDED: "REMARK_ADDED",
  REMARK_EDITED: "REMARK_EDITED",
  REMARK_DELETED: "REMARK_DELETED",
  PROJECT_ASSIGNED: "PROJECT_ASSIGNED",
  PROJECT_UNASSIGNED: "PROJECT_UNASSIGNED",
  TIMELINE_EVENT_EDITED: "TIMELINE_EVENT_EDITED",
  TIMELINE_EVENT_DELETED: "TIMELINE_EVENT_DELETED"
});

const SYSTEM_ACTOR = Object.freeze({
  id: null,
  role: "system",
  name: "Google Sheets Sync"
});

function isTimelineEventType(value) {
  return Object.values(TIMELINE_EVENT_TYPES).includes(value);
}

function leadIdFromRowNumber(rowNumber) {
  const n = Number(rowNumber);
  if (!Number.isSafeInteger(n) || n < 2) return null;
  return String(n);
}

function serializeEventData(data) {
  return JSON.stringify(data && typeof data === "object" ? data : {});
}

function parseEventData(raw) {
  try {
    const parsed = JSON.parse(raw || "{}");
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

async function insertTimelineEvent(db, {
  projectId,
  leadId,
  eventType,
  eventData,
  actorUserId = null,
  actorRole = null
}) {
  if (!isTimelineEventType(eventType)) {
    return { error: "Invalid timeline event type.", statusCode: 400 };
  }
  const id = String(leadId || "").trim();
  if (!id) return { error: "Invalid lead id.", statusCode: 400 };

  // Server-generated timestamp only — never accept client created_at.
  const result = await db.prepare(`
    INSERT INTO lead_timeline_events
      (project_id, lead_id, event_type, event_data, actor_user_id, actor_role, created_at, updated_at, is_deleted)
    VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 0)
  `).run(
    projectId,
    id,
    eventType,
    serializeEventData(eventData),
    actorUserId,
    actorRole
  );

  return { value: Number(result.lastInsertRowid) };
}

async function hasLeadGeneratedEvent(db, projectId, leadId) {
  const row = await db.prepare(`
    SELECT id FROM lead_timeline_events
    WHERE project_id = ? AND lead_id = ? AND event_type = ? AND is_deleted = 0
    LIMIT 1
  `).get(projectId, String(leadId), TIMELINE_EVENT_TYPES.LEAD_GENERATED);
  return Boolean(row);
}

async function ensureLeadGeneratedEvent(db, {
  projectId,
  leadId,
  source = null,
  projectName = null
}) {
  if (await hasLeadGeneratedEvent(db, projectId, leadId)) {
    return { created: false };
  }
  const inserted = await insertTimelineEvent(db, {
    projectId,
    leadId,
    eventType: TIMELINE_EVENT_TYPES.LEAD_GENERATED,
    eventData: {
      title: "Lead Generated",
      source: source || null,
      projectName: projectName || null,
      actorLabel: SYSTEM_ACTOR.name
    },
    actorUserId: null,
    actorRole: SYSTEM_ACTOR.role
  });
  if (inserted.error) return inserted;
  return { created: true, id: inserted.value };
}

async function recordLeadGeneratedForRows(db, {
  projectId,
  rowNumbers,
  leads,
  columns,
  projectName
}) {
  const helpers = (() => {
    try {
      return require("./public/phone-helpers");
    } catch {
      return null;
    }
  })();
  const sourceCol = helpers?.findColumnByAliases
    ? helpers.findColumnByAliases(columns, ["source", "lead source", "campaign source"])
    : (columns || []).find(c => String(c).trim().toLowerCase() === "source") || null;

  let created = 0;
  for (let i = 0; i < rowNumbers.length; i += 1) {
    const leadId = leadIdFromRowNumber(rowNumbers[i]);
    if (!leadId) continue;
    const lead = leads?.[i] || {};
    const source = sourceCol ? String(lead[sourceCol] ?? "").trim() || null : null;
    const result = await ensureLeadGeneratedEvent(db, {
      projectId,
      leadId,
      source,
      projectName
    });
    if (result.created) created += 1;
  }
  return { created };
}

async function recordStatusChangedEvent(db, {
  projectId,
  leadId,
  fromStatus,
  toStatus,
  actor
}) {
  if (String(fromStatus || "") === String(toStatus || "")) {
    return { created: false, skipped: true };
  }
  const inserted = await insertTimelineEvent(db, {
    projectId,
    leadId,
    eventType: TIMELINE_EVENT_TYPES.STATUS_CHANGED,
    eventData: {
      title: "Status Changed",
      fromStatus,
      toStatus,
      actorLabel: actor?.name || actor?.login_id || "User"
    },
    actorUserId: actor?.id ?? null,
    actorRole: actor?.role ?? null
  });
  if (inserted.error) return inserted;
  return { created: true, id: inserted.value };
}

async function listTimelineEvents(db, { projectId, leadId, includeDeleted = false }) {
  const rows = includeDeleted
    ? await db.prepare(`
        SELECT e.*, u.name AS actor_name, u.login_id AS actor_login_id
        FROM lead_timeline_events e
        LEFT JOIN app_users u ON u.id = e.actor_user_id
        WHERE e.project_id = ? AND e.lead_id = ?
        ORDER BY e.created_at DESC, e.id DESC
      `).all(projectId, String(leadId))
    : await db.prepare(`
        SELECT e.*, u.name AS actor_name, u.login_id AS actor_login_id
        FROM lead_timeline_events e
        LEFT JOIN app_users u ON u.id = e.actor_user_id
        WHERE e.project_id = ? AND e.lead_id = ? AND e.is_deleted = 0
        ORDER BY e.created_at DESC, e.id DESC
      `).all(projectId, String(leadId));

  return rows.map(sanitizeTimelineEvent);
}

function sanitizeTimelineEvent(row) {
  const data = parseEventData(row.event_data);
  const softDeleted = Boolean(row.is_deleted);
  return {
    id: Number(row.id),
    projectId: Number(row.project_id),
    leadId: String(row.lead_id),
    eventType: row.event_type,
    eventData: softDeleted
      ? { title: "Event removed by Admin", notice: "Event removed by Admin" }
      : data,
    actor: {
      userId: row.actor_user_id == null ? null : Number(row.actor_user_id),
      role: row.actor_role || null,
      name: row.actor_name || data.actorLabel || null,
      loginId: row.actor_login_id || null
    },
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    isDeleted: softDeleted
  };
}

async function getTimelineEvent(db, eventId) {
  return await db.prepare("SELECT * FROM lead_timeline_events WHERE id = ?").get(eventId) || null;
}

/**
 * Admin correction: preserve original via audit event; optionally update display data.
 * Never trusts client timestamps or actor ids.
 */
async function adminEditTimelineEvent(db, {
  eventId,
  projectId,
  newEventData,
  reason,
  adminUser
}) {
  const existing = await getTimelineEvent(db, eventId);
  if (!existing || Number(existing.project_id) !== Number(projectId)) {
    return { error: "Timeline event not found.", statusCode: 404 };
  }
  if (existing.is_deleted) {
    return { error: "Cannot edit a deleted timeline event.", statusCode: 400 };
  }

  const previousData = parseEventData(existing.event_data);
  const nextData = newEventData && typeof newEventData === "object" ? newEventData : previousData;

  await db.prepare(`
    UPDATE lead_timeline_events
    SET event_data = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(serializeEventData(nextData), eventId);

  await insertTimelineEvent(db, {
    projectId,
    leadId: existing.lead_id,
    eventType: TIMELINE_EVENT_TYPES.TIMELINE_EVENT_EDITED,
    eventData: {
      title: "Timeline Event Edited",
      originalEventId: Number(existing.id),
      originalEventType: existing.event_type,
      originalEventData: previousData,
      newEventData: nextData,
      reason: typeof reason === "string" ? reason.trim().slice(0, 500) || null : null,
      actorLabel: adminUser?.name || adminUser?.login_id || "Admin"
    },
    actorUserId: adminUser.id,
    actorRole: adminUser.role
  });

  return { value: true };
}

async function adminSoftDeleteTimelineEvent(db, {
  eventId,
  projectId,
  adminUser
}) {
  const existing = await getTimelineEvent(db, eventId);
  if (!existing || Number(existing.project_id) !== Number(projectId)) {
    return { error: "Timeline event not found.", statusCode: 404 };
  }
  if (existing.is_deleted) {
    return { error: "Timeline event already deleted.", statusCode: 400 };
  }

  await db.prepare(`
    UPDATE lead_timeline_events
    SET is_deleted = 1, deleted_by = ?, deleted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(adminUser.id, eventId);

  await insertTimelineEvent(db, {
    projectId,
    leadId: existing.lead_id,
    eventType: TIMELINE_EVENT_TYPES.TIMELINE_EVENT_DELETED,
    eventData: {
      title: "Event removed by Admin",
      originalEventId: Number(existing.id),
      originalEventType: existing.event_type,
      originalEventData: parseEventData(existing.event_data),
      actorLabel: adminUser?.name || adminUser?.login_id || "Admin"
    },
    actorUserId: adminUser.id,
    actorRole: adminUser.role
  });

  return { value: true };
}

function rejectProjectUserTimelineMutation() {
  return { error: "Not authorized.", statusCode: 403 };
}

module.exports = {
  TIMELINE_EVENT_TYPES,
  SYSTEM_ACTOR,
  isTimelineEventType,
  leadIdFromRowNumber,
  insertTimelineEvent,
  hasLeadGeneratedEvent,
  ensureLeadGeneratedEvent,
  recordLeadGeneratedForRows,
  recordStatusChangedEvent,
  listTimelineEvents,
  sanitizeTimelineEvent,
  getTimelineEvent,
  adminEditTimelineEvent,
  adminSoftDeleteTimelineEvent,
  rejectProjectUserTimelineMutation,
  parseEventData,
  serializeEventData
};
