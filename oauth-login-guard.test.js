"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { createGoogleLoginStarter } = require("./oauth-login-guard");

test("google login starter navigates exactly once across repeated clicks", () => {
  const navigations = [];
  const googleLogin = createGoogleLoginStarter(url => {
    navigations.push(url);
  });

  assert.deepEqual(googleLogin(), { navigated: true, duplicate: false });
  assert.deepEqual(googleLogin(), { navigated: false, duplicate: true });
  assert.deepEqual(googleLogin(), { navigated: false, duplicate: true });
  assert.deepEqual(navigations, ["/api/auth/google?returnTo=/"]);
});

test("ungarded double click pattern can schedule two OAuth navigations", () => {
  const navigations = [];
  function unguardedGoogleLogin() {
    navigations.push("/api/auth/google?returnTo=/");
  }
  unguardedGoogleLogin();
  unguardedGoogleLogin();
  assert.equal(navigations.length, 2);
});
