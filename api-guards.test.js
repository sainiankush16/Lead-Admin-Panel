"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { resolveAdminUser, csrfTokensMatch, shouldBypassBrowserCsrf } = require("./api-guards");

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

test("browser CSRF bypass is only allowed for validated mobile bearer auth", () => {
  assert.equal(shouldBypassBrowserCsrf({ mobileBearerAuth: true }), true);
  assert.equal(shouldBypassBrowserCsrf({ mobileBearerAuth: "true" }), false);
  assert.equal(shouldBypassBrowserCsrf({ mobileBearerAuth: false }), false);
  assert.equal(shouldBypassBrowserCsrf({}), false);
});
