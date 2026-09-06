"use strict";

const crypto = require("crypto");
const { ROLES } = require("./authz");
const { hashPassword } = require("./password");
const {
  deleteMobileSessionTokensForUser,
  sessionStoreDestroy
} = require("./mobile-auth");

const DELETED_DISPLAY_NAME = "Deleted User";

function deletedLoginIdForUser(userId) {
  const id = Number(userId);
  const stamp = Date.now().toString(36);
  const candidate = `deleted_${id}_${stamp}`;
  return candidate.slice(0, 64);
}

async function countActiveAdmins(db) {
  const row = await db
    .prepare(
      `SELECT COUNT(*) AS count
       FROM app_users
       WHERE role = ? AND is_active = 1`
    )
    .get(ROLES.ADMIN);
  return Number(row?.count || 0);
}

async function listSessionSidsForUser(db, userId) {
  const target = Number(userId);
  const sids = new Set();

  const mobileRows = await db
    .prepare("SELECT sid FROM mobile_session_tokens WHERE user_id = ?")
    .all(target);
  for (const row of mobileRows || []) {
    if (row?.sid) sids.add(String(row.sid));
  }

  const sessionRows = await db.prepare("SELECT sid, sess FROM sessions").all();
  for (const row of sessionRows || []) {
    if (!row?.sess) continue;
    try {
      const sess = JSON.parse(row.sess);
      if (Number(sess?.userId) === target && row.sid) {
        sids.add(String(row.sid));
      }
    } catch {
      // Ignore malformed session payloads.
    }
  }

  return [...sids];
}

/**
 * Account deletion for Website CRM app_users.
 *
 * Design (schema-backed):
 * - Anonymize the app_user row in place so lead_remarks.author_user_id FK remains valid
 *   without CASCADE-deleting business remarks.
 * - Timeline actor_user_id is SET NULL on hard delete; anonymization keeps audit linkage
 *   while removing personal identifiers.
 * - Project assignments are removed.
 * - Mobile tokens and matching web sessions are destroyed.
 * - Google Sheets connection (`users` table) is a shared admin Sheets authorization
 *   keyed by ADMIN_EMAIL and is intentionally NOT removed on CRM account deletion,
 *   because projects FK to that row and remaining admins still need Sheets access.
 *   Use explicit POST /api/google/disconnect to clear Google credentials.
 * - Last active admin cannot self-delete.
 */
async function deleteAuthenticatedAccount(db, {
  user,
  sessionStore = null,
  currentSid = null
} = {}) {
  if (!user || !user.id) {
    return { ok: false, statusCode: 401, error: "Not authenticated." };
  }

  const userId = Number(user.id);
  const existing = await db.prepare("SELECT * FROM app_users WHERE id = ?").get(userId);
  if (!existing || !existing.is_active) {
    return { ok: false, statusCode: 401, error: "Not authenticated." };
  }

  if (existing.role === ROLES.ADMIN) {
    const activeAdmins = await countActiveAdmins(db);
    if (activeAdmins <= 1) {
      return {
        ok: false,
        statusCode: 403,
        error:
          "The final administrator account cannot be deleted. Create another admin first or contact support."
      };
    }
  }

  const sids = await listSessionSidsForUser(db, userId);
  if (currentSid) sids.push(String(currentSid));

  const unusablePassword = await hashPassword(crypto.randomBytes(32).toString("base64url"));
  const loginId = deletedLoginIdForUser(userId);

  await db
    .prepare(
      `UPDATE app_users
       SET name = ?,
           login_id = ?,
           password_hash = ?,
           is_active = 0,
           session_version = session_version + 1,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`
    )
    .run(DELETED_DISPLAY_NAME, loginId, unusablePassword, userId);

  await db.prepare("DELETE FROM project_user_assignments WHERE user_id = ?").run(userId);
  await deleteMobileSessionTokensForUser(db, userId);

  if (sessionStore) {
    const uniqueSids = [...new Set(sids.filter(Boolean))];
    for (const sid of uniqueSids) {
      await sessionStoreDestroy(sessionStore, sid);
    }
  }

  return {
    ok: true,
    statusCode: 200,
    value: {
      deleted: true,
      anonymized: true,
      preservedLeadData: true,
      preservedGoogleSheets: true,
      preservedProjects: true,
      preservedGoogleAuthorization: true,
      userId
    }
  };
}

function accountDeletionResponseBody() {
  return {
    ok: true,
    deleted: true,
    message: "Your Website CRM account has been permanently deleted."
  };
}

module.exports = {
  DELETED_DISPLAY_NAME,
  deletedLoginIdForUser,
  countActiveAdmins,
  listSessionSidsForUser,
  deleteAuthenticatedAccount,
  accountDeletionResponseBody
};
