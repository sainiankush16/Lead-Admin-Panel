const assert = require("node:assert/strict");
const test = require("node:test");
const { normalizeLeadStatus } = require("./lead-status");
const {
  sheetDataFromValues,
  findLeadStatusColumn,
  findLeadStatusColumnIndex,
  leadStatusSummary,
  filterLeads
} = require("./sheet-data");

test("dynamic headers retain every available sheet column", () => {
  const data = sheetDataFromValues([["Name", "Lead Status", "Notes", ""], ["Ada", "New", "Call back", "x"]]);
  assert.deepEqual(data.columns, ["Name", "Lead Status", "Notes", "Column 4"]);
  assert.deepEqual(data.leads[0], { Name: "Ada", "Lead Status": "New", Notes: "Call back", "Column 4": "x" });
});

test("non-empty sheet headers are displayed exactly as supplied", () => {
  const data = sheetDataFromValues([[" Date ", "Lead Status"], ["2026-01-01", "New"]]);
  assert.deepEqual(data.columns, [" Date ", "Lead Status"]);
});

test("Lead Status is detected case-insensitively", () => {
  assert.equal(findLeadStatusColumn(["Name", "lead status", "Owner"]), "lead status");
  assert.equal(findLeadStatusColumn(["Name", "  LEAD STATUS  ", "Owner"]), "  LEAD STATUS  ");
  assert.equal(findLeadStatusColumn(["Name", "Status"]), null);
});

test("lead status summary returns unique counts and percentages", () => {
  const columns = ["Name", "Lead Status", "Campaign"];
  const leads = [
    { Name: "Ada", "Lead Status": "New", Campaign: "Spring" },
    { Name: "Ben", "Lead Status": "Contacted", Campaign: "Summer" },
    { Name: "Cam", "Lead Status": "New", Campaign: "Autumn" },
    { Name: "Dee", "Lead Status": "", Campaign: "Winter" }
  ];
  const summary = leadStatusSummary(columns, leads);
  assert.equal(summary.totalLeads, 4);
  assert.deepEqual(summary.statuses, [
    { name: "New", count: 3, percentage: 75 },
    { name: "Contacted", count: 1, percentage: 25 }
  ]);
});

test("blank Lead Status counts as New without inventing Other/Unknown", () => {
  assert.equal(normalizeLeadStatus(""), "New");
  const summary = leadStatusSummary(["Lead Status"], [{ "Lead Status": "" }]);
  assert.deepEqual(summary.statuses, [{ name: "New", count: 1, percentage: 100 }]);
});

test("row numbers map to actual spreadsheet rows and skip the header", () => {
  const data = sheetDataFromValues([
    ["Name", "Lead Status"],
    ["Ada", "New"],
    ["", ""],
    ["Ben", "Lost"]
  ]);
  assert.deepEqual(data.rowNumbers, [2, 4]);
  assert.equal(findLeadStatusColumnIndex(data.columns), 1);
});

test("empty sheet handling returns no headers and no leads", () => {
  assert.deepEqual(sheetDataFromValues([]), { columns: [], leads: [], rowNumbers: [], rowCount: 0 });
  assert.deepEqual(sheetDataFromValues([["Name", "Lead Status"], ["", ""]]).leads, []);
});

test("missing Lead Status column is reported without fabricating statuses", () => {
  assert.deepEqual(leadStatusSummary(["Name", "Source"], [{ Name: "Ada", Source: "Referral" }]), {
    statusColumn: null, totalLeads: 1, statuses: []
  });
});

test("total leads excludes header and empty rows", () => {
  const data = sheetDataFromValues([["Name", "Lead Status"], ["Ada", "New"], ["", ""], ["Ben", "Lost"]]);
  assert.equal(data.rowCount, 2);
  assert.equal(data.leads.length, 2);
});

test("search spans every dynamic column and filtering uses lead status", () => {
  const columns = ["Name", "Lead Status", "Campaign", "Remarks"];
  const leads = [
    { Name: "Ada", "Lead Status": "New", Campaign: "Launch", Remarks: "Budget approved" },
    { Name: "Ben", "Lead Status": "Lost", Campaign: "Search", Remarks: "No reply" }
  ];
  assert.deepEqual(filterLeads(columns, leads, "approved"), [leads[0]]);
  assert.deepEqual(filterLeads(columns, leads, "", "Lost"), [leads[1]]);
  assert.deepEqual(filterLeads(columns, leads, "", "New"), [leads[0]]);
  assert.deepEqual(filterLeads(columns, [{ Name: "Cam", "Lead Status": "", Campaign: "x", Remarks: "y" }], "new"), [
    { Name: "Cam", "Lead Status": "", Campaign: "x", Remarks: "y" }
  ]);
});

test("duplicate headers are made distinct without losing values", () => {
  const data = sheetDataFromValues([["Email", "email"], ["one@example.test", "two@example.test"]]);
  assert.deepEqual(data.columns, ["Email", "email (2)"]);
  assert.equal(data.leads[0]["email (2)"], "two@example.test");
});
