"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const Database = require("better-sqlite3");
const SQLiteSessionStore = require("./session-store");

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

test("SQLite session store persists, reads, and destroys sessions", async () => {
  const sqlite = new Database(":memory:");
  const db = wrapBetterSqlite(sqlite);
  const store = new SQLiteSessionStore(db);
  const session = { cookie: { expires: new Date(Date.now() + 60_000).toISOString() }, userId: 7 };

  await call(store, "set", "session-id", session);
  assert.deepEqual(await call(store, "get", "session-id"), session);
  await call(store, "destroy", "session-id");
  assert.equal(await call(store, "get", "session-id"), null);
  sqlite.close();
});
