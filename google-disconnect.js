"use strict";

const { oauth2Client } = require("./google");

const REVOKE_ALREADY_INVALID = new Set([
  "invalid_token",
  "invalid_grant",
  "expired",
  "token revoked",
  "Token has been expired or revoked"
]);

function classifyRevokeError(err) {
  const code = String(err?.code || err?.response?.status || "").toLowerCase();
  const message = String(err?.message || err?.response?.data?.error || "").toLowerCase();
  const networkCodes = new Set([
    "enetunreach",
    "econnrefused",
    "econnreset",
    "etimedout",
    "enotfound",
    "eai_again",
    "network_error"
  ]);

  if (networkCodes.has(code) || /network|timeout|econn|enotfound|socket/.test(message)) {
    return "network";
  }

  if (
    code === "400" ||
    code === "401" ||
    REVOKE_ALREADY_INVALID.has(message) ||
    /invalid_token|invalid_grant|revoked|expired/.test(message)
  ) {
    return "already_invalid";
  }

  return "error";
}

/**
 * Attempt Google token revocation. Never logs the token.
 * Returns { status: "revoked" | "already_invalid" | "network" | "error" | "skipped" }
 */
async function revokeGoogleRefreshToken(refreshToken, { revokeFn } = {}) {
  const token = typeof refreshToken === "string" ? refreshToken.trim() : "";
  if (!token) return { status: "skipped" };

  const run =
    typeof revokeFn === "function"
      ? revokeFn
      : async raw => {
          const client = oauth2Client();
          await client.revokeToken(raw);
        };

  try {
    await run(token);
    return { status: "revoked" };
  } catch (err) {
    return { status: classifyRevokeError(err) };
  }
}

async function listStoredGoogleCredentialRows(db) {
  const rows = await db
    .prepare(
      `SELECT id, email, google_sub, name,
              CASE WHEN refresh_token_enc IS NOT NULL AND TRIM(refresh_token_enc) != '' THEN 1 ELSE 0 END AS has_token
       FROM users`
    )
    .all();
  return Array.isArray(rows) ? rows : [];
}

async function clearAllGoogleRefreshTokens(db) {
  const result = await db
    .prepare(
      `UPDATE users
       SET refresh_token_enc = NULL,
           updated_at = CURRENT_TIMESTAMP
       WHERE refresh_token_enc IS NOT NULL AND TRIM(refresh_token_enc) != ''`
    )
    .run();
  return Number(result?.changes || 0);
}

/**
 * Disconnect the shared Google Sheets authorization.
 *
 * Architecture notes:
 * - Google credentials live in `users` (not `app_users`).
 * - Projects FK to `users.id` with ON DELETE CASCADE — the row must be retained.
 * - Connection is selected by ADMIN_EMAIL via getGoogleConnection; credentials are shared.
 * - Account deletion of CRM admins does NOT own this row; disconnect is explicit admin action.
 */
async function disconnectGoogleAuthorization(db, {
  connection = null,
  decryptFn,
  revokeFn = null
} = {}) {
  const rows = await listStoredGoogleCredentialRows(db);
  const withToken = rows.filter(row => Number(row.has_token) === 1);

  if (!withToken.length) {
    return {
      ok: true,
      statusCode: 200,
      value: {
        disconnected: true,
        alreadyDisconnected: true,
        revokeStatus: "skipped",
        clearedTokens: 0,
        preservedProjects: true,
        preservedSheets: true,
        preservedAccounts: true
      }
    };
  }

  let revokeStatus = "skipped";
  const target = connection && connection.refresh_token_enc ? connection : null;

  if (target?.refresh_token_enc && typeof decryptFn === "function") {
    let plaintext = null;
    try {
      plaintext = decryptFn(target.refresh_token_enc);
    } catch {
      // Corrupt ciphertext: still clear local storage.
      plaintext = null;
      revokeStatus = "already_invalid";
    }

    if (plaintext) {
      const revoked = await revokeGoogleRefreshToken(plaintext, { revokeFn });
      revokeStatus = revoked.status;
    }
  }

  // Always clear local credentials so Website CRM no longer holds a usable token.
  const clearedTokens = await clearAllGoogleRefreshTokens(db);

  return {
    ok: true,
    statusCode: 200,
    value: {
      disconnected: true,
      alreadyDisconnected: false,
      revokeStatus,
      clearedTokens,
      preservedProjects: true,
      preservedSheets: true,
      preservedAccounts: true,
      // Network revoke failure still clears local credentials for security posture.
      localCredentialsCleared: clearedTokens > 0
    }
  };
}

function googleDisconnectResponseBody(resultValue = {}) {
  return {
    ok: true,
    disconnected: true,
    alreadyDisconnected: Boolean(resultValue.alreadyDisconnected),
    message: resultValue.alreadyDisconnected
      ? "Google authorization is already disconnected."
      : "Google authorization has been disconnected."
  };
}

module.exports = {
  classifyRevokeError,
  revokeGoogleRefreshToken,
  listStoredGoogleCredentialRows,
  clearAllGoogleRefreshTokens,
  disconnectGoogleAuthorization,
  googleDisconnectResponseBody
};
