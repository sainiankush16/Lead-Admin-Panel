"use strict";

/**
 * Per-lead status update locking.
 * - In-process promise chain serializes concurrent handlers on the same instance.
 * - DB lock rows coordinate across serverless instances sharing Turso/SQLite.
 */

const inProcessChains = new Map();
const LOCK_TTL_MS = 30_000;
const ACQUIRE_ATTEMPTS = 40;
const ACQUIRE_DELAY_MS = 25;

async function ensureStatusUpdateLockSchema(db) {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS status_update_locks (
      lock_key TEXT PRIMARY KEY,
      owner_token TEXT NOT NULL,
      locked_until INTEGER NOT NULL
    );
  `);
}

function leadStatusLockKey(projectId, rowNumber) {
  return `lead_status:${Number(projectId)}:${Number(rowNumber)}`;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function withInProcessLeadLock(lockKey, fn) {
  const prev = inProcessChains.get(lockKey) || Promise.resolve();
  const run = prev.then(
    () => fn(),
    () => fn()
  );
  const cleanup = run.then(
    () => undefined,
    () => undefined
  );
  inProcessChains.set(lockKey, cleanup);
  cleanup.then(() => {
    if (inProcessChains.get(lockKey) === cleanup) {
      inProcessChains.delete(lockKey);
    }
  });
  return run;
}

async function tryAcquireDbLock(db, lockKey, ownerToken, now) {
  await db.prepare("DELETE FROM status_update_locks WHERE locked_until < ?").run(now);
  try {
    await db
      .prepare(
        `INSERT INTO status_update_locks (lock_key, owner_token, locked_until)
         VALUES (?, ?, ?)`
      )
      .run(lockKey, ownerToken, now + LOCK_TTL_MS);
    return true;
  } catch {
    return false;
  }
}

async function releaseDbLock(db, lockKey, ownerToken) {
  await db
    .prepare("DELETE FROM status_update_locks WHERE lock_key = ? AND owner_token = ?")
    .run(lockKey, ownerToken);
}

async function withLeadStatusLock(db, projectId, rowNumber, fn) {
  const lockKey = leadStatusLockKey(projectId, rowNumber);
  const ownerToken = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

  return withInProcessLeadLock(lockKey, async () => {
    let acquired = false;
    for (let attempt = 0; attempt < ACQUIRE_ATTEMPTS; attempt += 1) {
      acquired = await tryAcquireDbLock(db, lockKey, ownerToken, Date.now());
      if (acquired) break;
      await sleep(ACQUIRE_DELAY_MS);
    }
    if (!acquired) {
      const err = new Error("Lead status update is busy. Please try again.");
      err.statusCode = 409;
      throw err;
    }
    try {
      return await fn();
    } finally {
      await releaseDbLock(db, lockKey, ownerToken);
    }
  });
}

module.exports = {
  ensureStatusUpdateLockSchema,
  leadStatusLockKey,
  withLeadStatusLock,
  withInProcessLeadLock,
  LOCK_TTL_MS
};
