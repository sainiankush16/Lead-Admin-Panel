"use strict";

const crypto = require("crypto");

function safeEqual(left, right) {
  if (typeof left !== "string" || typeof right !== "string") return false;
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function resolveAdminUser(user, adminEmail) {
  if (!user) return { ok: false, status: 401, error: "Not authenticated." };
  if (String(user.email || "").toLowerCase() !== String(adminEmail || "").trim().toLowerCase()) {
    return { ok: false, status: 403, error: "Not authorized." };
  }
  return { ok: true };
}

function csrfTokensMatch(expected, received) {
  return Boolean(expected) && safeEqual(expected, received);
}

module.exports = { safeEqual, resolveAdminUser, csrfTokensMatch };
