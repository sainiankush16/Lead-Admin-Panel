"use strict";

/**
 * Persistent login throttling for browser + mobile password login.
 * Uses the existing SQLite/Turso database so limits survive across Vercel instances.
 *
 * Buckets:
 * - combo (ip+login): stricter — primary abuse signal
 * - login: slower cross-IP spray against one ID
 * - ip: higher threshold so shared NAT/mobile CGNAT is not locked out quickly
 */

const COMBO_MAX_FAILURES = 8;
const LOGIN_MAX_FAILURES = 20;
const IP_MAX_FAILURES = 40;
const WINDOW_MS = 15 * 60 * 1000;
const BLOCK_MS = 15 * 60 * 1000;

const GENERIC_AUTH_ERROR = "Invalid login ID or password.";
const THROTTLED_ERROR = "Too many login attempts. Please try again later.";

async function ensureLoginThrottleSchema(db) {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS login_throttle (
      bucket_key TEXT PRIMARY KEY,
      fail_count INTEGER NOT NULL DEFAULT 0,
      window_started_at INTEGER NOT NULL,
      blocked_until INTEGER
    );
    CREATE INDEX IF NOT EXISTS login_throttle_blocked_idx ON login_throttle(blocked_until);
  `);
}

function normalizeLoginId(loginId) {
  return String(loginId || "")
    .trim()
    .toLowerCase()
    .slice(0, 64);
}

function clientIpFromRequest(req) {
  const forwarded = String(req?.headers?.["x-forwarded-for"] || "")
    .split(",")[0]
    .trim();
  const ip = forwarded || String(req?.ip || req?.socket?.remoteAddress || "unknown").trim();
  return ip.slice(0, 128) || "unknown";
}

function throttleBuckets(ip, loginId) {
  const login = normalizeLoginId(loginId) || "_empty";
  const safeIp = String(ip || "unknown");
  return {
    combo: `combo:${safeIp}:${login}`,
    login: `login:${login}`,
    ip: `ip:${safeIp}`
  };
}

function limitForBucketKey(bucketKey) {
  if (bucketKey.startsWith("combo:")) return COMBO_MAX_FAILURES;
  if (bucketKey.startsWith("login:")) return LOGIN_MAX_FAILURES;
  return IP_MAX_FAILURES;
}

async function readBucket(db, bucketKey) {
  return (await db.prepare("SELECT * FROM login_throttle WHERE bucket_key = ?").get(bucketKey)) || null;
}

async function isBucketBlocked(db, bucketKey, now) {
  const row = await readBucket(db, bucketKey);
  if (!row) return false;
  if (row.blocked_until && Number(row.blocked_until) > now) return true;
  return false;
}

async function assertLoginAllowed(db, { ip, loginId }) {
  const now = Date.now();
  const buckets = throttleBuckets(ip, loginId);
  for (const key of Object.values(buckets)) {
    if (await isBucketBlocked(db, key, now)) {
      return { ok: false, statusCode: 429, error: THROTTLED_ERROR };
    }
  }
  return { ok: true, buckets };
}

async function recordLoginFailure(db, { ip, loginId }) {
  const now = Date.now();
  const buckets = throttleBuckets(ip, loginId);
  for (const key of Object.values(buckets)) {
    const max = limitForBucketKey(key);
    const row = await readBucket(db, key);
    if (!row || now - Number(row.window_started_at || 0) > WINDOW_MS) {
      await db.prepare("DELETE FROM login_throttle WHERE bucket_key = ?").run(key);
      const blockedUntil = 1 >= max ? now + BLOCK_MS : null;
      await db
        .prepare(
          `INSERT INTO login_throttle (bucket_key, fail_count, window_started_at, blocked_until)
           VALUES (?, 1, ?, ?)`
        )
        .run(key, now, blockedUntil);
      continue;
    }

    const nextCount = Number(row.fail_count || 0) + 1;
    const blockedUntil = nextCount >= max ? now + BLOCK_MS : row.blocked_until || null;
    await db
      .prepare(
        `UPDATE login_throttle
         SET fail_count = ?, blocked_until = ?
         WHERE bucket_key = ?`
      )
      .run(nextCount, blockedUntil, key);
  }
}

async function clearLoginThrottleOnSuccess(db, { ip, loginId }) {
  const buckets = throttleBuckets(ip, loginId);
  // Clear combo + login so a successful auth recovers that account.
  // Leave IP soft-state alone except combo path already cleared per-IP pair.
  for (const key of [buckets.combo, buckets.login]) {
    await db.prepare("DELETE FROM login_throttle WHERE bucket_key = ?").run(key);
  }
}

module.exports = {
  GENERIC_AUTH_ERROR,
  THROTTLED_ERROR,
  COMBO_MAX_FAILURES,
  LOGIN_MAX_FAILURES,
  IP_MAX_FAILURES,
  WINDOW_MS,
  BLOCK_MS,
  ensureLoginThrottleSchema,
  normalizeLoginId,
  clientIpFromRequest,
  throttleBuckets,
  assertLoginAllowed,
  recordLoginFailure,
  clearLoginThrottleOnSuccess
};
