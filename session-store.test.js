const assert = require("node:assert/strict");
const test = require("node:test");
const Database = require("better-sqlite3");
const SQLiteSessionStore = require("./session-store");

function call(store, method, ...args) {
  return new Promise((resolve, reject) => {
    store[method](...args, (err, value) => err ? reject(err) : resolve(value));
  });
}

test("SQLite session store persists, reads, and destroys sessions", async () => {
  const db = new Database(":memory:");
  const store = new SQLiteSessionStore(db);
  const session = { cookie: { expires: new Date(Date.now() + 60_000).toISOString() }, userId: 7 };

  await call(store, "set", "session-id", session);
  assert.deepEqual(await call(store, "get", "session-id"), session);
  await call(store, "destroy", "session-id");
  assert.equal(await call(store, "get", "session-id"), null);
  db.close();
});
