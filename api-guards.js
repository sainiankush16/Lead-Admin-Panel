"use strict";

const crypto = require("crypto");
const {
  resolveAdminUser,
  resolveAuthenticatedUser,
  resolveAdminRole,
  canAccessProject,
  ROLES
} = require("./authz");

function safeEqual(left, right) {
  if (typeof left !== "string" || typeof right !== "string") return false;
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function csrfTokensMatch(expected, received) {
  return Boolean(expected) && safeEqual(expected, received);
}

module.exports = {
  safeEqual,
  csrfTokensMatch,
  resolveAdminUser,
  resolveAuthenticatedUser,
  resolveAdminRole,
  canAccessProject,
  ROLES
};
