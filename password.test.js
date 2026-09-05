"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  hashPassword,
  verifyPassword,
  validateLoginId,
  validatePassword,
  isArgon2Hash
} = require("./password");

test("password hashing uses Argon2id and verifies correctly", async () => {
  const hash = await hashPassword("CorrectHorseBattery!");
  assert.equal(isArgon2Hash(hash), true);
  assert.equal(await verifyPassword(hash, "CorrectHorseBattery!"), true);
  assert.equal(await verifyPassword(hash, "wrong-password"), false);
  assert.equal(await verifyPassword(null, "CorrectHorseBattery!"), false);
});

test("login id and password validation reject weak inputs", () => {
  assert.ok(validateLoginId("ab").error);
  assert.ok(validateLoginId("bad id").error);
  assert.equal(validateLoginId("Rahul01").value, "rahul01");
  assert.ok(validatePassword("short").error);
  assert.equal(validatePassword("longenough").value, "longenough");
});
