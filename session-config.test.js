"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const Database = require("better-sqlite3");
const session = require("express-session");
const SQLiteSessionStore = require("./session-store");
const {
  shouldTrustProxy,
  requiresHttpsBaseUrl,
  buildSessionCookieOptions,
  buildSessionOptions,
  isValidOauthCallback
} = require("./session-config");

function wrapBetterSqlite(sqlite) {
  return {
    driver: "better-sqlite3",
    ready: Promise.resolve(),
    async exec(sql) {
      sqlite.exec(sql);
    },
    prepare(sql) {
      const statement = sqlite.prepare(sql);
      return {
        async get(...params) {
          return statement.get(...params);
        },
        async all(...params) {
          return statement.all(...params);
        },
        async run(...params) {
          return statement.run(...params);
        }
      };
    }
  };
}

function call(store, method, ...args) {
  return new Promise((resolve, reject) => {
    store[method](...args, (err, value) => err ? reject(err) : resolve(value));
  });
}

test("production session cookies stay httpOnly, secure, and SameSite=lax with proxy trust", () => {
  const options = buildSessionOptions({
    isProduction: true,
    secret: "test-secret",
    store: {}
  });
  assert.equal(options.proxy, true);
  assert.deepEqual(options.cookie, {
    httpOnly: true,
    sameSite: "lax",
    secure: true,
    maxAge: 1000 * 60 * 60 * 24 * 7
  });
  assert.equal(options.saveUninitialized, false);
  assert.equal(options.resave, false);
  assert.equal(options.name, "lead_admin_sid");
});

test("development session cookies remain non-secure while still proxy-aware", () => {
  const cookie = buildSessionCookieOptions(false);
  assert.equal(cookie.secure, false);
  assert.equal(cookie.httpOnly, true);
  assert.equal(cookie.sameSite, "lax");
  assert.equal(buildSessionOptions({ isProduction: false, secret: "x", store: {} }).proxy, true);
});

test("TRUST_PROXY and VERCEL enable Express trust-proxy for HTTPS reverse proxies", () => {
  assert.equal(shouldTrustProxy({}), false);
  assert.equal(shouldTrustProxy({ TRUST_PROXY: "false", VERCEL: "0" }), false);
  assert.equal(shouldTrustProxy({ TRUST_PROXY: "true" }), true);
  assert.equal(shouldTrustProxy({ VERCEL: "1" }), true);
  assert.equal(requiresHttpsBaseUrl({ NODE_ENV: "development" }), false);
  assert.equal(requiresHttpsBaseUrl({ NODE_ENV: "production" }), true);
  assert.equal(requiresHttpsBaseUrl({ VERCEL: "1" }), true);
});

test("OAuth callback state validation accepts matching state and rejects mismatches", () => {
  assert.equal(isValidOauthCallback({
    code: "auth-code",
    requestState: "state-one",
    sessionState: "state-one"
  }), true);
  assert.equal(isValidOauthCallback({
    code: "auth-code",
    requestState: "state-one",
    sessionState: "state-two"
  }), false);
  assert.equal(isValidOauthCallback({
    code: "auth-code",
    requestState: "state-one",
    sessionState: ""
  }), false);
  assert.equal(isValidOauthCallback({
    code: "",
    requestState: "state-one",
    sessionState: "state-one"
  }), false);
});

test("OAuth state persists through the session store for the callback round-trip", async () => {
  const sqlite = new Database(":memory:");
  const db = wrapBetterSqlite(sqlite);
  const store = new SQLiteSessionStore(db);
  const sid = "oauth-session-id";
  const sess = {
    cookie: { expires: new Date(Date.now() + 60_000).toISOString() },
    oauthState: "persisted-oauth-state",
    oauthReturnTo: "/"
  };

  await call(store, "set", sid, sess);
  const loaded = await call(store, "get", sid);
  assert.equal(loaded.oauthState, "persisted-oauth-state");
  assert.equal(isValidOauthCallback({
    code: "google-code",
    requestState: "persisted-oauth-state",
    sessionState: loaded.oauthState
  }), true);
  sqlite.close();
});

test("express-session options keep proxy enabled so secure cookies can be set behind Vercel", () => {
  const options = buildSessionOptions({
    isProduction: true,
    secret: "session-secret",
    store: new session.MemoryStore()
  });
  assert.equal(options.proxy, true);
  assert.equal(options.cookie.secure, true);
});
