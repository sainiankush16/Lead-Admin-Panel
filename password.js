"use strict";

const argon2 = require("argon2");

const ARGON2_OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1
};

const LOGIN_ID_PATTERN = /^[a-zA-Z0-9._-]{3,64}$/;

function validateLoginId(value) {
  const loginId = typeof value === "string" ? value.trim() : "";
  if (!LOGIN_ID_PATTERN.test(loginId)) {
    return { error: "Login ID must be 3–64 characters (letters, numbers, ., _, -)." };
  }
  return { value: loginId.toLowerCase() };
}

function validatePassword(value, { required = true } = {}) {
  if (value == null || value === "") {
    return required ? { error: "Password is required." } : { value: null };
  }
  if (typeof value !== "string") return { error: "Password is required." };
  if (value.length < 8 || value.length > 128) {
    return { error: "Password must be between 8 and 128 characters." };
  }
  return { value };
}

function validateDisplayName(value) {
  const name = typeof value === "string" ? value.trim() : "";
  if (!name || name.length > 120) {
    return { error: "Name must be between 1 and 120 characters." };
  }
  return { value: name };
}

async function hashPassword(password) {
  return argon2.hash(password, ARGON2_OPTIONS);
}

async function verifyPassword(hash, password) {
  if (typeof hash !== "string" || !hash || typeof password !== "string") return false;
  try {
    return await argon2.verify(hash, password);
  } catch {
    return false;
  }
}

function isArgon2Hash(value) {
  return typeof value === "string" && value.startsWith("$argon2");
}

module.exports = {
  ARGON2_OPTIONS,
  LOGIN_ID_PATTERN,
  validateLoginId,
  validatePassword,
  validateDisplayName,
  hashPassword,
  verifyPassword,
  isArgon2Hash
};
