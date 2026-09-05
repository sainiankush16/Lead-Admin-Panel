"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { tursoConfig } = require("./db");

test("tursoConfig reads Turso environment variables without hard-coding secrets", () => {
  const previousUrl = process.env.TURSO_DATABASE_URL;
  const previousToken = process.env.TURSO_AUTH_TOKEN;
  const previousLibsqlUrl = process.env.LIBSQL_URL;
  const previousLibsqlToken = process.env.LIBSQL_AUTH_TOKEN;

  delete process.env.TURSO_DATABASE_URL;
  delete process.env.TURSO_AUTH_TOKEN;
  delete process.env.LIBSQL_URL;
  delete process.env.LIBSQL_AUTH_TOKEN;
  assert.equal(tursoConfig(), null);

  process.env.TURSO_DATABASE_URL = "libsql://example.turso.io";
  process.env.TURSO_AUTH_TOKEN = "test-token";
  assert.deepEqual(tursoConfig(), {
    url: "libsql://example.turso.io",
    authToken: "test-token"
  });

  if (previousUrl === undefined) delete process.env.TURSO_DATABASE_URL;
  else process.env.TURSO_DATABASE_URL = previousUrl;
  if (previousToken === undefined) delete process.env.TURSO_AUTH_TOKEN;
  else process.env.TURSO_AUTH_TOKEN = previousToken;
  if (previousLibsqlUrl === undefined) delete process.env.LIBSQL_URL;
  else process.env.LIBSQL_URL = previousLibsqlUrl;
  if (previousLibsqlToken === undefined) delete process.env.LIBSQL_AUTH_TOKEN;
  else process.env.LIBSQL_AUTH_TOKEN = previousLibsqlToken;
});

test("local better-sqlite3 adapter keeps the async prepare interface", async () => {
  const db = require("./db");
  assert.equal(db.driver, "better-sqlite3");
  await db.ready;
  const row = await db.prepare("SELECT 1 AS value").get();
  assert.equal(row.value, 1);
});
