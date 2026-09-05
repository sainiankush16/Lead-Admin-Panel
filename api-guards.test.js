"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { resolveAdminUser, csrfTokensMatch } = require("./api-guards");

test("authenticated update requirement rejects anonymous and non-admin users", () => {
  assert.deepEqual(resolveAdminUser(null, "admin@example.test"), {
    ok: false,
    status: 401,
    error: "Not authenticated."
  });
  assert.deepEqual(resolveAdminUser({ email: "other@example.test" }, "admin@example.test"), {
    ok: false,
    status: 403,
    error: "Not authorized."
  });
  assert.deepEqual(resolveAdminUser({ email: "Admin@example.test" }, "admin@example.test"), { ok: true });
});

test("CSRF requirement rejects missing or mismatched tokens", () => {
  assert.equal(csrfTokensMatch("token-a", "token-a"), true);
  assert.equal(csrfTokensMatch("token-a", "token-b"), false);
  assert.equal(csrfTokensMatch(undefined, "token-a"), false);
  assert.equal(csrfTokensMatch("token-a", undefined), false);
});
