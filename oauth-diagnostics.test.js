"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  shortHash,
  headerHasCookie,
  inspectSetCookieHeader,
  buildOauthStartDiagnostics,
  buildOauthCallbackDiagnostics,
  assertDiagnosticsAreSafe,
  lookupSessionStore
} = require("./oauth-diagnostics");

test("shortHash is stable, short, and non-reversible form", () => {
  assert.equal(shortHash("abc"), shortHash("abc"));
  assert.notEqual(shortHash("abc"), shortHash("abcd"));
  assert.equal(shortHash("abc").length, 12);
  assert.equal(shortHash(""), null);
  assert.equal(shortHash(null), null);
});

test("headerHasCookie detects lead_admin_sid without exposing values", () => {
  assert.equal(headerHasCookie("lead_admin_sid=s%3Asecret.value; Path=/"), true);
  assert.equal(headerHasCookie("other=1"), false);
  assert.equal(headerHasCookie(""), false);
  assert.equal(headerHasCookie(undefined), false);
});

test("inspectSetCookieHeader reports flags only", () => {
  const flags = inspectSetCookieHeader(
    "lead_admin_sid=s%3Asecret.value; Path=/; HttpOnly; Secure; SameSite=Lax"
  );
  assert.deepEqual(flags, {
    setCookiePresent: true,
    secure: true,
    httpOnly: true,
    sameSite: "Lax",
    path: "/"
  });
  assert.equal(JSON.stringify(flags).includes("secret"), false);
});

test("oauth start/callback diagnostics never include secrets or raw state", () => {
  const req = {
    session: { oauthState: "raw-state-value-should-not-appear" },
    sessionID: "raw-session-id-should-not-appear",
    secure: true,
    headers: { cookie: "lead_admin_sid=s%3Arawcookievalue.signature" },
    query: { code: "raw-oauth-code", state: "raw-state-value-should-not-appear" },
    get(name) {
      if (name === "host") return "lead-admin-panel.vercel.app";
      if (name === "x-forwarded-proto") return "https";
      return "";
    }
  };
  const res = {
    getHeader() {
      return "lead_admin_sid=s%3Arawcookievalue.signature; Path=/; HttpOnly; Secure; SameSite=Lax";
    }
  };

  const start = buildOauthStartDiagnostics({
    req,
    res,
    isProduction: true,
    expectedHost: "lead-admin-panel.vercel.app",
    saveSucceeded: true,
    oauthStateGenerated: true,
    sessionId: req.sessionID,
    oauthState: "raw-state-value-should-not-appear",
    cookieIntended: { httpOnly: true, sameSite: "lax", secure: true }
  });
  const callback = buildOauthCallbackDiagnostics({
    req,
    isProduction: true,
    expectedHost: "lead-admin-panel.vercel.app",
    requestState: "raw-state-value-should-not-appear",
    sessionState: "raw-state-value-should-not-appear",
    statesMatch: true,
    storeLookupSucceeded: true
  });

  assertDiagnosticsAreSafe(start);
  assertDiagnosticsAreSafe(callback);

  const blob = JSON.stringify({ start, callback });
  assert.equal(blob.includes("raw-state-value-should-not-appear"), false);
  assert.equal(blob.includes("raw-session-id-should-not-appear"), false);
  assert.equal(blob.includes("rawcookievalue"), false);
  assert.equal(blob.includes("raw-oauth-code"), false);
  assert.equal(start.oauthStateHash, shortHash("raw-state-value-should-not-appear"));
  assert.equal(callback.statesMatch, true);
  assert.equal(callback.sidCookieReceived, true);
  assert.equal(callback.storeLookupSucceeded, true);
});

test("lookupSessionStore reports hit/miss without throwing", async () => {
  const hit = {
    get(sid, cb) {
      cb(null, { oauthState: "x" });
    }
  };
  const miss = {
    get(sid, cb) {
      cb(null, null);
    }
  };
  assert.equal(await lookupSessionStore(hit, "abc"), true);
  assert.equal(await lookupSessionStore(miss, "abc"), false);
  assert.equal(await lookupSessionStore(null, "abc"), false);
  assert.equal(await lookupSessionStore(hit, ""), false);
});

test("onResponseHeaders fires once before writeHead", () => {
  const { onResponseHeaders } = require("./oauth-diagnostics");
  let calls = 0;
  const res = {
    writeHead(...args) {
      return args;
    }
  };
  onResponseHeaders(res, () => {
    calls += 1;
  });
  assert.deepEqual(res.writeHead(302, { Location: "/" }), [302, { Location: "/" }]);
  assert.deepEqual(res.writeHead(302, { Location: "/" }), [302, { Location: "/" }]);
  assert.equal(calls, 1);
});
