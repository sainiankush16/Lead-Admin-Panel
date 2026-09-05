"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { planLeadStatusUpdate, planLeadStatusColumnCreate } = require("./lead-status-ops");
const { columnLetter } = require("./google");

const project = {
  id: 7,
  user_id: 1,
  spreadsheet_id: "sheet_project_a",
  sheet_title: "Leads A"
};

const sheetData = {
  columns: ["Name", "Lead Status", "Notes"],
  leads: [
    { Name: "Ada", "Lead Status": "New", Notes: "a" },
    { Name: "Ben", "Lead Status": "", Notes: "b" }
  ],
  rowNumbers: [2, 4]
};

test("status update plans the stored project spreadsheet and exact cell", () => {
  const planned = planLeadStatusUpdate({
    project,
    sheetData,
    rowNumber: 4,
    status: "Contacted"
  });
  assert.deepEqual(planned.value, {
    spreadsheetId: "sheet_project_a",
    sheetTitle: "Leads A",
    columnIndex: 1,
    rowNumber: 4,
    status: "Contacted"
  });
  assert.equal(`${columnLetter(planned.value.columnIndex)}${planned.value.rowNumber}`, "B4");
});

test("status update never uses a client-supplied spreadsheet identity", () => {
  const planned = planLeadStatusUpdate({
    project,
    sheetData,
    rowNumber: 2,
    status: "Lost"
  });
  assert.equal(planned.value.spreadsheetId, project.spreadsheet_id);
  assert.equal(planned.value.sheetTitle, project.sheet_title);
  assert.notEqual(planned.value.spreadsheetId, "sheet_project_b");
});

test("status update rejects unknown rows and missing columns", () => {
  assert.equal(planLeadStatusUpdate({ project: null, sheetData, rowNumber: 2, status: "New" }).statusCode, 404);
  assert.equal(planLeadStatusUpdate({ project, sheetData, rowNumber: 99, status: "New" }).error, "Lead row not found.");
  assert.equal(planLeadStatusUpdate({
    project,
    sheetData: { columns: ["Name"], leads: [], rowNumbers: [2] },
    rowNumber: 2,
    status: "New"
  }).error, "Lead Status column not found.");
  assert.equal(planLeadStatusUpdate({ project, sheetData, rowNumber: 2, status: "Nope" }).error, "Invalid Lead Status.");
});

test("Lead Status column creation appends at the end and initializes blank rows", () => {
  const planned = planLeadStatusColumnCreate({
    project,
    sheetData: {
      columns: ["Name", "Phone", "Source"],
      leads: [{ Name: "Ada", Phone: "1", Source: "Web" }],
      rowNumbers: [2, 3]
    }
  });
  assert.deepEqual(planned.value, {
    spreadsheetId: "sheet_project_a",
    sheetTitle: "Leads A",
    columnIndex: 3,
    rowNumbers: [2, 3],
    defaultStatus: "New"
  });
});

test("Lead Status column creation is rejected when the column already exists", () => {
  const planned = planLeadStatusColumnCreate({ project, sheetData });
  assert.equal(planned.statusCode, 409);
  assert.equal(planned.error, "Lead Status column already exists.");
});

test("project isolation keeps Project B spreadsheet out of Project A writes", () => {
  const projectB = { ...project, id: 8, spreadsheet_id: "sheet_project_b", sheet_title: "Leads B" };
  const forA = planLeadStatusUpdate({ project, sheetData, rowNumber: 2, status: "Interested" });
  const forB = planLeadStatusUpdate({ project: projectB, sheetData, rowNumber: 2, status: "Interested" });
  assert.equal(forA.value.spreadsheetId, "sheet_project_a");
  assert.equal(forB.value.spreadsheetId, "sheet_project_b");
  assert.notEqual(forA.value.spreadsheetId, forB.value.spreadsheetId);
});
