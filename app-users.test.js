"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const Database = require("better-sqlite3");
const {
  ensureAppUserSchema,
  bootstrapAdminUser,
  authenticateAppUser,
  createProjectUser,
  setUserActive,
  resetUserPassword,
  replaceUserProjects,
  userHasProjectAssignment,
  listAppUsers,
  listAssignedProjectIds,
  findAppUserById
} = require("./app-users");
const { hashPassword } = require("./password");
const { ROLES } = require("./authz");
const { canAccessProject } = require("./authz");
const { validateLeadStatusUpdate } = require("./lead-status");

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

async function createTestDb() {
  const sqlite = new Database(":memory:");
  sqlite.pragma("foreign_keys = ON");
  sqlite.exec(`
    CREATE TABLE users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      google_sub TEXT NOT NULL UNIQUE,
      email TEXT NOT NULL UNIQUE,
      name TEXT,
      picture TEXT,
      refresh_token_enc TEXT
    );
    CREATE TABLE projects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      spreadsheet_id TEXT NOT NULL,
      spreadsheet_name TEXT,
      sheet_id INTEGER,
      sheet_title TEXT NOT NULL,
      columns_json TEXT NOT NULL DEFAULT '[]',
      sync_snapshot_json TEXT NOT NULL DEFAULT '{}',
      last_sync TEXT,
      UNIQUE(user_id, spreadsheet_id, sheet_id),
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `);
  const db = wrapBetterSqlite(sqlite);
  await ensureAppUserSchema(db);
  return { sqlite, db };
}

test("admin bootstrap and valid/invalid login flows", async () => {
  const { sqlite, db } = await createTestDb();
  const passwordHash = await hashPassword("AdminPass123!");
  await bootstrapAdminUser(db, { loginId: "admin", passwordHash });

  const ok = await authenticateAppUser(db, "admin", "AdminPass123!");
  assert.equal(ok.ok, true);
  assert.equal(ok.user.role, ROLES.ADMIN);

  const badPassword = await authenticateAppUser(db, "admin", "nope");
  assert.equal(badPassword.ok, false);
  assert.equal(badPassword.error, "Invalid login ID or password.");

  const badId = await authenticateAppUser(db, "missing", "AdminPass123!");
  assert.equal(badId.ok, false);
  assert.equal(badId.error, "Invalid login ID or password.");
  sqlite.close();
});

test("disabled project user cannot authenticate", async () => {
  const { sqlite, db } = await createTestDb();
  const created = await createProjectUser(db, {
    name: "Rahul",
    loginId: "rahul01",
    password: "UserPass123!",
    projectIds: []
  });
  assert.ok(created.value);
  await setUserActive(db, created.value.id, false);
  const result = await authenticateAppUser(db, "rahul01", "UserPass123!");
  assert.equal(result.ok, false);
  sqlite.close();
});

test("project assignment isolation and lead status whitelist", async () => {
  const { sqlite, db } = await createTestDb();
  await db.prepare("INSERT INTO users (google_sub, email, name) VALUES (?, ?, ?)").run("g1", "admin@example.test", "G");
  const owner = await db.prepare("SELECT id FROM users WHERE email = ?").get("admin@example.test");
  await db.prepare(`INSERT INTO projects (user_id, name, spreadsheet_id, sheet_id, sheet_title)
    VALUES (?, ?, ?, ?, ?)`).run(owner.id, "Advitya", "sheetA", 1, "Leads");
  await db.prepare(`INSERT INTO projects (user_id, name, spreadsheet_id, sheet_id, sheet_title)
    VALUES (?, ?, ?, ?, ?)`).run(owner.id, "Mayur", "sheetB", 2, "Leads");
  const projects = await db.prepare("SELECT id, name FROM projects ORDER BY name").all();
  const advitya = projects.find(p => p.name === "Advitya");
  const mayur = projects.find(p => p.name === "Mayur");

  const created = await createProjectUser(db, {
    name: "Rahul",
    loginId: "rahul01",
    password: "UserPass123!",
    projectIds: [advitya.id]
  });
  const user = await findAppUserById(db, created.value.id);

  assert.equal(await userHasProjectAssignment(db, user.id, advitya.id), true);
  assert.equal(await userHasProjectAssignment(db, user.id, mayur.id), false);
  assert.equal(canAccessProject(user, true).ok, true);
  assert.equal(canAccessProject(user, false).status, 403);
  assert.deepEqual(await listAssignedProjectIds(db, user.id), [advitya.id]);

  await replaceUserProjects(db, user.id, [mayur.id]);
  assert.equal(await userHasProjectAssignment(db, user.id, advitya.id), false);
  assert.equal(await userHasProjectAssignment(db, user.id, mayur.id), true);

  assert.ok(validateLeadStatusUpdate({ status: "New" }).value);
  assert.ok(validateLeadStatusUpdate({ status: "Name" }).error);
  assert.ok(validateLeadStatusUpdate({ status: "Phone" }).error);
  assert.ok(validateLeadStatusUpdate({ status: "Email" }).error);
  sqlite.close();
});

test("duplicate login id rejected and password reset bumps session version", async () => {
  const { sqlite, db } = await createTestDb();
  const first = await createProjectUser(db, {
    name: "Rahul",
    loginId: "rahul01",
    password: "UserPass123!"
  });
  assert.ok(first.value);
  const dup = await createProjectUser(db, {
    name: "Other",
    loginId: "rahul01",
    password: "UserPass123!"
  });
  assert.equal(dup.statusCode, 409);

  const before = await findAppUserById(db, first.value.id);
  await resetUserPassword(db, first.value.id, "NewPass12345!");
  const after = await findAppUserById(db, first.value.id);
  assert.equal(Number(after.session_version), Number(before.session_version) + 1);
  assert.equal((await authenticateAppUser(db, "rahul01", "UserPass123!")).ok, false);
  assert.equal((await authenticateAppUser(db, "rahul01", "NewPass12345!")).ok, true);

  const users = await listAppUsers(db);
  assert.equal(users.length, 1);
  assert.equal(JSON.stringify(users).includes("password_hash"), false);
  sqlite.close();
});

test("deleting a project clears assignments", async () => {
  const { sqlite, db } = await createTestDb();
  await db.prepare("INSERT INTO users (google_sub, email) VALUES (?, ?)").run("g1", "admin@example.test");
  const owner = await db.prepare("SELECT id FROM users LIMIT 1").get();
  await db.prepare(`INSERT INTO projects (user_id, name, spreadsheet_id, sheet_id, sheet_title)
    VALUES (?, ?, ?, ?, ?)`).run(owner.id, "Advitya", "sheetA", 1, "Leads");
  const project = await db.prepare("SELECT id FROM projects LIMIT 1").get();
  const created = await createProjectUser(db, {
    name: "Rahul",
    loginId: "rahul01",
    password: "UserPass123!",
    projectIds: [project.id]
  });
  await db.prepare("DELETE FROM project_user_assignments WHERE project_id = ?").run(project.id);
  await db.prepare("DELETE FROM projects WHERE id = ?").run(project.id);
  assert.equal(await userHasProjectAssignment(db, created.value.id, project.id), false);
  sqlite.close();
});
