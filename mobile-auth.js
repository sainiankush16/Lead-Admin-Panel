"use strict";

const crypto = require("crypto");
const { SESSION_COOKIE_MAX_AGE_MS } = require("./session-config");

const MOBILE_TOKEN_BYTES = 32;

const MOBILE_SESSION_TOKEN_SCHEMA = `
  CREATE TABLE IF NOT EXISTS mobile_session_tokens (
    token_hash TEXT PRIMARY KEY,
    sid TEXT NOT NULL,
    user_id INTEGER NOT NULL,
    expires_at INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE INDEX IF NOT EXISTS mobile_session_tokens_sid_idx ON mobile_session_tokens(sid);
  CREATE INDEX IF NOT EXISTS mobile_session_tokens_user_idx ON mobile_session_tokens(user_id);
  CREATE INDEX IF NOT EXISTS mobile_session_tokens_expires_idx ON mobile_session_tokens(expires_at);
`;

function ensureMobileTokenSecret(secret) {
  if (typeof secret !== "string" || secret.length < 16) {
    throw new Error("SESSION_SECRET is required to hash mobile session tokens.");
  }
  return secret;
}

function generateMobileToken() {
  return crypto.randomBytes(MOBILE_TOKEN_BYTES).toString("base64url");
}

function hashMobileToken(rawToken, secret) {
  const key = ensureMobileTokenSecret(secret);
  const token = String(rawToken || "");
  if (!token) return "";
  return crypto.createHmac("sha256", key).update(token, "utf8").digest("hex");
}

function extractBearerToken(authorizationHeader) {
  if (typeof authorizationHeader !== "string") return null;
  const match = /^Bearer\s+(\S+)$/i.exec(authorizationHeader.trim());
  if (!match) return null;
  const token = match[1];
  if (!token || token.length > 512) return null;
  return token;
}

async function ensureMobileSessionTokenSchema(db) {
  await db.exec(MOBILE_SESSION_TOKEN_SCHEMA);
}

function defaultMobileTokenExpiry(now = Date.now()) {
  return now + SESSION_COOKIE_MAX_AGE_MS;
}

async function issueMobileSessionToken(db, {
  sid,
  userId,
  secret,
  expiresAt = defaultMobileTokenExpiry()
}) {
  if (!sid || !userId) {
    throw new Error("Mobile session token requires sid and userId.");
  }
  const rawToken = generateMobileToken();
  const tokenHash = hashMobileToken(rawToken, secret);
  await db.prepare(`
    INSERT INTO mobile_session_tokens (token_hash, sid, user_id, expires_at)
    VALUES (?, ?, ?, ?)
  `).run(tokenHash, String(sid), Number(userId), Number(expiresAt));
  return {
    rawToken,
    tokenHash,
    expiresAt: Number(expiresAt)
  };
}

async function lookupMobileSessionToken(db, rawToken, secret) {
  const tokenHash = hashMobileToken(rawToken, secret);
  if (!tokenHash) return { status: "missing" };
  const row = await db.prepare(`
    SELECT token_hash, sid, user_id, expires_at
    FROM mobile_session_tokens
    WHERE token_hash = ?
  `).get(tokenHash);
  if (!row) return { status: "missing", tokenHash };
  if (Number(row.expires_at) <= Date.now()) {
    return { status: "expired", tokenHash, row };
  }
  return { status: "ok", tokenHash, row };
}

async function deleteMobileSessionToken(db, tokenHash) {
  if (!tokenHash) return;
  await db.prepare("DELETE FROM mobile_session_tokens WHERE token_hash = ?").run(tokenHash);
}

async function deleteMobileSessionTokensForSid(db, sid) {
  if (!sid) return;
  await db.prepare("DELETE FROM mobile_session_tokens WHERE sid = ?").run(String(sid));
}

async function deleteMobileSessionTokensForUser(db, userId) {
  if (!userId) return;
  await db.prepare("DELETE FROM mobile_session_tokens WHERE user_id = ?").run(Number(userId));
}

async function purgeExpiredMobileSessionTokens(db, now = Date.now()) {
  await db.prepare("DELETE FROM mobile_session_tokens WHERE expires_at <= ?").run(Number(now));
}

function sessionStoreGet(store, sid) {
  return new Promise((resolve, reject) => {
    store.get(sid, (err, sess) => (err ? reject(err) : resolve(sess || null)));
  });
}

function sessionStoreDestroy(store, sid) {
  return new Promise((resolve, reject) => {
    store.destroy(sid, err => (err ? reject(err) : resolve()));
  });
}

module.exports = {
  MOBILE_TOKEN_BYTES,
  MOBILE_SESSION_TOKEN_SCHEMA,
  generateMobileToken,
  hashMobileToken,
  extractBearerToken,
  ensureMobileSessionTokenSchema,
  defaultMobileTokenExpiry,
  issueMobileSessionToken,
  lookupMobileSessionToken,
  deleteMobileSessionToken,
  deleteMobileSessionTokensForSid,
  deleteMobileSessionTokensForUser,
  purgeExpiredMobileSessionTokens,
  sessionStoreGet,
  sessionStoreDestroy
};
