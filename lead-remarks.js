"use strict";

const {
  TIMELINE_EVENT_TYPES,
  insertTimelineEvent,
  leadIdFromRowNumber
} = require("./lead-timeline");

const MAX_REMARK_LENGTH = 2000;

function validateRemarkBody(value) {
  if (typeof value !== "string") return { error: "Remark text is required." };
  const body = value.trim();
  if (!body) return { error: "Remark text is required." };
  if (body.length > MAX_REMARK_LENGTH) {
    return { error: `Remark must be at most ${MAX_REMARK_LENGTH} characters.` };
  }
  return { value: body };
}

function sanitizeRemark(row) {
  if (!row || row.is_deleted) return null;
  return {
    id: Number(row.id),
    projectId: Number(row.project_id),
    leadId: String(row.lead_id),
    body: row.body,
    author: {
      userId: row.author_user_id == null ? null : Number(row.author_user_id),
      name: row.author_name || null,
      loginId: row.author_login_id || null,
      role: row.author_role || null
    },
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

async function listRemarks(db, { projectId, leadId }) {
  const rows = await db.prepare(`
    SELECT r.*, u.name AS author_name, u.login_id AS author_login_id, u.role AS author_role
    FROM lead_remarks r
    LEFT JOIN app_users u ON u.id = r.author_user_id
    WHERE r.project_id = ? AND r.lead_id = ? AND r.is_deleted = 0
    ORDER BY r.created_at DESC, r.id DESC
  `).all(projectId, String(leadId));
  return rows.map(sanitizeRemark).filter(Boolean);
}

async function createRemark(db, {
  projectId,
  leadId,
  body,
  actor
}) {
  const lead = leadIdFromRowNumber(leadId) || String(leadId || "").trim();
  if (!lead) return { error: "Invalid lead id.", statusCode: 400 };
  const validated = validateRemarkBody(body);
  if (validated.error) return { error: validated.error, statusCode: 400 };

  const result = await db.prepare(`
    INSERT INTO lead_remarks
      (project_id, lead_id, body, author_user_id, created_at, updated_at, is_deleted)
    VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 0)
  `).run(projectId, lead, validated.value, actor.id);

  const remarkId = Number(result.lastInsertRowid);

  await insertTimelineEvent(db, {
    projectId,
    leadId: lead,
    eventType: TIMELINE_EVENT_TYPES.REMARK_ADDED,
    eventData: {
      title: "Remark Added",
      remarkId,
      text: validated.value,
      actorLabel: actor.name || actor.login_id || "User"
    },
    actorUserId: actor.id,
    actorRole: actor.role
  });

  const rows = await listRemarks(db, { projectId, leadId: lead });
  return { value: rows.find(item => item.id === remarkId) || rows[0] };
}

async function getRemark(db, remarkId) {
  return await db.prepare("SELECT * FROM lead_remarks WHERE id = ?").get(remarkId) || null;
}

async function editRemark(db, {
  remarkId,
  projectId,
  body,
  actor,
  isAdmin
}) {
  const existing = await getRemark(db, remarkId);
  if (!existing || Number(existing.project_id) !== Number(projectId) || existing.is_deleted) {
    return { error: "Remark not found.", statusCode: 404 };
  }
  if (!isAdmin && Number(existing.author_user_id) !== Number(actor.id)) {
    return { error: "Not authorized.", statusCode: 403 };
  }

  const validated = validateRemarkBody(body);
  if (validated.error) return { error: validated.error, statusCode: 400 };
  const previous = existing.body;

  await db.prepare(`
    UPDATE lead_remarks
    SET body = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(validated.value, remarkId);

  await insertTimelineEvent(db, {
    projectId,
    leadId: existing.lead_id,
    eventType: TIMELINE_EVENT_TYPES.REMARK_EDITED,
    eventData: {
      title: "Remark Edited",
      remarkId: Number(remarkId),
      previousText: previous,
      text: validated.value,
      actorLabel: actor.name || actor.login_id || "User"
    },
    actorUserId: actor.id,
    actorRole: actor.role
  });

  const rows = await listRemarks(db, { projectId, leadId: existing.lead_id });
  return { value: rows.find(item => item.id === Number(remarkId)) };
}

async function softDeleteRemark(db, {
  remarkId,
  projectId,
  actor,
  isAdmin
}) {
  const existing = await getRemark(db, remarkId);
  if (!existing || Number(existing.project_id) !== Number(projectId) || existing.is_deleted) {
    return { error: "Remark not found.", statusCode: 404 };
  }
  if (!isAdmin && Number(existing.author_user_id) !== Number(actor.id)) {
    return { error: "Not authorized.", statusCode: 403 };
  }

  await db.prepare(`
    UPDATE lead_remarks
    SET is_deleted = 1, deleted_by = ?, deleted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(actor.id, remarkId);

  await insertTimelineEvent(db, {
    projectId,
    leadId: existing.lead_id,
    eventType: TIMELINE_EVENT_TYPES.REMARK_DELETED,
    eventData: {
      title: "Remark Deleted",
      remarkId: Number(remarkId),
      text: existing.body,
      actorLabel: actor.name || actor.login_id || "User"
    },
    actorUserId: actor.id,
    actorRole: actor.role
  });

  return { value: true };
}

module.exports = {
  MAX_REMARK_LENGTH,
  validateRemarkBody,
  sanitizeRemark,
  listRemarks,
  createRemark,
  editRemark,
  softDeleteRemark,
  getRemark
};
