"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const {
  validateProjectName,
  validateCreateProjectPayload,
  mapSpreadsheets,
  filterSpreadsheets,
  mapSheetTabs,
  mapProjectConfiguration,
  canSubmitCreateProject,
  mapProjectManagementError,
  responseContainsSecrets
} = require("./mobile/utils/projectManagementCore");

test("project name validation matches backend rules", () => {
  assert.equal(validateProjectName("").ok, false);
  assert.equal(validateProjectName("   ").ok, false);
  assert.equal(validateProjectName("x".repeat(121)).ok, false);
  assert.equal(validateProjectName(" Advitya ").value, "Advitya");
});

test("create payload validation and busy submit guard", () => {
  assert.equal(validateCreateProjectPayload({
    name: "A",
    spreadsheetId: "short",
    sheetId: 0,
    sheetTitle: "Leads"
  }).ok, false);
  const ok = validateCreateProjectPayload({
    name: "Advitya",
    spreadsheetId: "1abcdefghijklmnopqrstuvwxyz0123456789",
    sheetId: 0,
    sheetTitle: "Leads"
  });
  assert.equal(ok.ok, true);
  assert.equal(
    canSubmitCreateProject({
      draft: ok.value,
      saving: true
    }),
    false
  );
  assert.equal(canSubmitCreateProject({ draft: ok.value, saving: false }), true);
});

test("spreadsheet and tab mapping/filter", () => {
  const sheets = mapSpreadsheets({
    spreadsheets: [
      { id: "1abcdefghijklmnopqrstuvwxyz0123456789", name: "Advitya Sheet" },
      { id: "bad", name: "Invalid" }
    ]
  });
  assert.equal(sheets.length, 1);
  assert.equal(filterSpreadsheets(sheets, "adv").length, 1);
  assert.equal(filterSpreadsheets(sheets, "zzz").length, 0);
  const tabs = mapSheetTabs({
    tabs: [
      { sheetId: 1, title: "B", index: 1 },
      { sheetId: 0, title: "A", index: 0 }
    ]
  });
  assert.equal(tabs[0].title, "A");
  assert.equal(tabs[1].sheetId, 1);
});

test("project configuration mapping and headers", () => {
  const config = mapProjectConfiguration({
    id: 7,
    name: "Advitya",
    sheetName: "Leads",
    spreadsheetId: "1abcdefghijklmnopqrstuvwxyz0123456789",
    spreadsheetName: "Advitya Sheet",
    sheetId: 0,
    columns: ["Name", "Phone", "Lead Status"],
    lastSync: null
  });
  assert.equal(config.name, "Advitya");
  assert.equal(config.spreadsheetName, "Advitya Sheet");
  assert.equal(config.sheetName, "Leads");
  assert.equal(config.headerCount, 3);
  assert.deepEqual(config.columns, ["Name", "Phone", "Lead Status"]);
});

test("error mapping covers auth google conflict and network", () => {
  assert.equal(mapProjectManagementError({ status: 401 }).clearAuth, true);
  assert.equal(
    mapProjectManagementError({
      status: 401,
      message: "Google authorization has expired. Please reconnect Google."
    }).googleAuth,
    true
  );
  assert.equal(mapProjectManagementError({ status: 403 }).message, "You don't have permission to manage projects.");
  assert.equal(mapProjectManagementError({ status: 404 }).message, "Project or spreadsheet not found.");
  assert.match(
    mapProjectManagementError({ status: 409 }).message,
    /already configured/i
  );
  assert.match(mapProjectManagementError({ name: "TypeError" }).message, /connection/i);
});

test("safe responses never include google credentials or secrets", () => {
  const safe = {
    connected: true,
    email: "admin@example.com",
    name: "Admin",
    spreadsheets: [{ id: "1abcdefghijklmnopqrstuvwxyz0123456789", name: "Sheet" }],
    tabs: [{ sheetId: 0, title: "Leads" }],
    project: {
      id: 1,
      name: "P",
      spreadsheetId: "1abcdefghijklmnopqrstuvwxyz0123456789",
      spreadsheetName: "Sheet",
      sheetName: "Leads",
      columns: ["Name"]
    }
  };
  assert.equal(responseContainsSecrets(safe), false);
  assert.equal(
    responseContainsSecrets({ refresh_token_enc: "secret", access_token: "x" }),
    true
  );
});

test("API client and screens use existing project management endpoints", () => {
  const apiSource = fs.readFileSync(path.join(__dirname, "mobile/services/api.ts"), "utf8");
  assert.match(apiSource, /getGoogleStatus\(\)/);
  assert.match(apiSource, /listSpreadsheets\(\)/);
  assert.match(apiSource, /listSheetTabs\(/);
  assert.match(apiSource, /createProject\(/);
  assert.match(apiSource, /\/api\/google\/status/);
  assert.match(apiSource, /\/api\/sheets/);
  assert.match(apiSource, /method:\s*"POST"/);
  assert.match(apiSource, /\/api\/projects/);

  const list = fs.readFileSync(path.join(__dirname, "mobile/app/(app)/projects/index.tsx"), "utf8");
  assert.match(list, /role === "admin"/);
  assert.match(list, /Add Project/);
  assert.match(list, /\/projects\/new/);

  const create = fs.readFileSync(path.join(__dirname, "mobile/app/(app)/projects/new.tsx"), "utf8");
  assert.match(create, /You don't have permission to manage projects/);
  assert.match(create, /api\.createProject/);
  assert.match(create, /Saving\.\.\./);
  assert.doesNotMatch(create, /deleteProject|DELETE/);

  const config = fs.readFileSync(
    path.join(__dirname, "mobile/app/(app)/projects/[projectId]/config.tsx"),
    "utf8"
  );
  assert.match(config, /Detected headers/);
  assert.match(config, /Manage user assignments/);
});
