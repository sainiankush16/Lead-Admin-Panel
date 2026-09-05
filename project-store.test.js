const assert = require("node:assert/strict");
const test = require("node:test");
const Database = require("better-sqlite3");

function database() {
  const db = new Database(":memory:");
  db.exec("CREATE TABLE projects (id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL, name TEXT NOT NULL, spreadsheet_id TEXT NOT NULL, sheet_id INTEGER NOT NULL, sheet_title TEXT NOT NULL, columns_json TEXT NOT NULL, UNIQUE(user_id, spreadsheet_id, sheet_id))");
  return db;
}

test("project creation persists configuration but not complete lead data", () => {
  const db = database();
  db.prepare("INSERT INTO projects (user_id,name,spreadsheet_id,sheet_id,sheet_title,columns_json) VALUES (?,?,?,?,?,?)")
    .run(1, "West", "spreadsheet_123", 42, "Leads", JSON.stringify(["Name", "Lead Status"]));
  const project = db.prepare("SELECT * FROM projects WHERE user_id = ?").get(1);
  assert.equal(project.name, "West");
  assert.equal(project.columns_json, '["Name","Lead Status"]');
  assert.equal(Object.hasOwn(project, "leads_json"), false);
  db.close();
});

test("unauthorized project access cannot retrieve another user's project", () => {
  const db = database();
  db.prepare("INSERT INTO projects (user_id,name,spreadsheet_id,sheet_id,sheet_title,columns_json) VALUES (?,?,?,?,?,?)")
    .run(1, "Private", "spreadsheet_123", 1, "Leads", "[]");
  const denied = db.prepare("SELECT * FROM projects WHERE id = ? AND user_id = ?").get(1, 2);
  assert.equal(denied, undefined);
  db.close();
});

test("project-specific lead retrieval resolves only the selected project's source", () => {
  const db = database();
  const insert = db.prepare("INSERT INTO projects (user_id,name,spreadsheet_id,sheet_id,sheet_title,columns_json) VALUES (?,?,?,?,?,?)");
  insert.run(1, "North", "sheet_north_123", 1, "North Leads", "[]");
  insert.run(1, "South", "sheet_south_123", 2, "South Leads", "[]");
  const selected = db.prepare("SELECT spreadsheet_id, sheet_title FROM projects WHERE id = ? AND user_id = ?").get(2, 1);
  assert.deepEqual(selected, { spreadsheet_id: "sheet_south_123", sheet_title: "South Leads" });
  db.close();
});

test("the same spreadsheet tab cannot be configured twice for one user", () => {
  const db = database();
  const insert = db.prepare("INSERT INTO projects (user_id,name,spreadsheet_id,sheet_id,sheet_title,columns_json) VALUES (?,?,?,?,?,?)");
  insert.run(1, "First", "spreadsheet_123", 42, "Leads", "[]");
  assert.throws(() => insert.run(1, "Duplicate", "spreadsheet_123", 42, "Leads", "[]"), /UNIQUE constraint failed/);
  db.close();
});
