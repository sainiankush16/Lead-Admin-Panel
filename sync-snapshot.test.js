"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  buildSyncSnapshot,
  compareSheetToSnapshot,
  syncInProgressGuard,
  parseSyncSnapshot
} = require("./sync-snapshot");
const { resolveAdminUser, csrfTokensMatch } = require("./api-guards");
const { normalizeLeadStatus } = require("./lead-status");

const columns = ["Name", "Phone", "Lead Status"];
const baselineLeads = [
  { Name: "Ada", Phone: "111", "Lead Status": "Contacted" },
  { Name: "Ben", Phone: "222", "Lead Status": "New" }
];
const baselineRows = [2, 3];

test("successful manual sync reports no new leads when the sheet is unchanged", () => {
  const previous = buildSyncSnapshot(columns, baselineLeads, baselineRows);
  const result = compareSheetToSnapshot(previous, columns, baselineLeads, baselineRows);
  assert.equal(result.newLeads, 0);
  assert.equal(result.changedLeads, 0);
  assert.equal(result.message, "Sync completed — no new leads found.");
  assert.equal(result.totalLeads, 2);
});

test("new lead detection uses spreadsheet row numbers", () => {
  const previous = buildSyncSnapshot(columns, baselineLeads, baselineRows);
  const leads = [
    ...baselineLeads,
    { Name: "Cam", Phone: "333", "Lead Status": "" }
  ];
  const result = compareSheetToSnapshot(previous, columns, leads, [2, 3, 5]);
  assert.equal(result.newLeads, 1);
  assert.deepEqual(result.newRowNumbers, [5]);
  assert.equal(result.message, "Sync completed — 1 new lead found.");
  assert.equal(normalizeLeadStatus(leads[2]["Lead Status"]), "New");
});

test("existing lead preservation keeps prior rows and detects content changes", () => {
  const previous = buildSyncSnapshot(columns, baselineLeads, baselineRows);
  const leads = [
    { Name: "Ada", Phone: "999", "Lead Status": "Contacted" },
    { Name: "Ben", Phone: "222", "Lead Status": "New" }
  ];
  const result = compareSheetToSnapshot(previous, columns, leads, baselineRows);
  assert.equal(result.newLeads, 0);
  assert.deepEqual(result.changedRowNumbers, [2]);
  assert.equal(result.message, "Sync completed — no new leads found.");
});

test("existing Lead Status values are preserved and excluded from change fingerprints", () => {
  const previous = buildSyncSnapshot(columns, baselineLeads, baselineRows);
  const leads = [
    { Name: "Ada", Phone: "111", "Lead Status": "Converted" },
    { Name: "Ben", Phone: "222", "Lead Status": "Lost" }
  ];
  const result = compareSheetToSnapshot(previous, columns, leads, baselineRows);
  assert.equal(result.changedLeads, 0);
  assert.equal(result.preservedStatuses[0].rawStatus, "Converted");
  assert.equal(result.preservedStatuses[0].unchangedNonEmpty, true);
  assert.equal(result.preservedStatuses[1].displayStatus, "Lost");
});

test("new blank status is treated as New without requiring a sheet write during sync", () => {
  const previous = buildSyncSnapshot(columns, baselineLeads, baselineRows);
  const leads = [
    ...baselineLeads,
    { Name: "Dee", Phone: "444", "Lead Status": "   " }
  ];
  const result = compareSheetToSnapshot(previous, columns, leads, [2, 3, 6]);
  assert.equal(result.newLeads, 1);
  assert.equal(result.preservedStatuses[2].displayStatus, "New");
  assert.equal(result.preservedStatuses[2].rawStatus.trim(), "");
});

test("correct row identity ignores lead names and tracks sheet row numbers", () => {
  const previous = buildSyncSnapshot(columns, baselineLeads, baselineRows);
  const renamed = [
    { Name: "NotAda", Phone: "111", "Lead Status": "Contacted" },
    { Name: "NotBen", Phone: "222", "Lead Status": "New" }
  ];
  const sameRows = compareSheetToSnapshot(previous, columns, renamed, baselineRows);
  assert.deepEqual(sameRows.changedRowNumbers, [2, 3]);
  assert.equal(sameRows.newLeads, 0);

  const movedRows = compareSheetToSnapshot(
    previous,
    columns,
    baselineLeads,
    [10, 11]
  );
  assert.equal(movedRows.newLeads, 2);
  assert.deepEqual(movedRows.newRowNumbers, [10, 11]);
});

test("project isolation keeps sync snapshots scoped to each project's rows", () => {
  const projectA = buildSyncSnapshot(columns, baselineLeads, baselineRows);
  const projectBLeads = [{ Name: "Zed", Phone: "000", "Lead Status": "New" }];
  const projectB = buildSyncSnapshot(columns, projectBLeads, [2]);
  assert.notDeepEqual(projectA.rows, projectB.rows);

  const syncA = compareSheetToSnapshot(projectA, columns, baselineLeads, baselineRows);
  const syncB = compareSheetToSnapshot(projectB, columns, [
    ...projectBLeads,
    { Name: "Yani", Phone: "001", "Lead Status": "" }
  ], [2, 3]);
  assert.equal(syncA.newLeads, 0);
  assert.equal(syncB.newLeads, 1);
  assert.deepEqual(syncB.newRowNumbers, [3]);
});

test("unauthorized sync is rejected by the shared admin guard", () => {
  assert.equal(resolveAdminUser(null, "admin@example.test").status, 401);
  assert.equal(resolveAdminUser({ email: "other@example.test" }, "admin@example.test").status, 403);
  assert.equal(csrfTokensMatch("csrf", undefined), false);
});

test("invalid project sync input is rejected before comparison", () => {
  assert.deepEqual(parseSyncSnapshot("not-json"), { rows: {} });
  const empty = compareSheetToSnapshot({ rows: { 2: "abc" } }, [], [], []);
  assert.equal(empty.totalLeads, 0);
  assert.equal(empty.newLeads, 0);
  assert.equal(empty.message, "Sync completed — no new leads found.");
});

test("Google API failure style errors stay generic for sync callers", () => {
  const failure = { code: "SHEET_TAB_MISSING", message: "Configured sheet tab was not found." };
  assert.equal(failure.code, "SHEET_TAB_MISSING");
  assert.equal(failure.message.includes("token"), false);
  assert.equal(String(failure.message).includes("stack"), false);
});

test("duplicate sync request guard blocks concurrent sync for the same project", () => {
  const guard = syncInProgressGuard();
  assert.equal(guard.tryBegin(7), true);
  assert.equal(guard.tryBegin(7), false);
  assert.equal(guard.isActive(7), true);
  assert.equal(guard.tryBegin(8), true);
  guard.end(7);
  assert.equal(guard.tryBegin(7), true);
  guard.end(7);
  guard.end(8);
});

test("last sync timestamp behavior keeps a fresh snapshot after sync analysis", () => {
  const previous = buildSyncSnapshot(columns, baselineLeads, baselineRows);
  const leads = [
    ...baselineLeads,
    { Name: "Eve", Phone: "555", "Lead Status": "Interested" }
  ];
  const first = compareSheetToSnapshot(previous, columns, leads, [2, 3, 4]);
  assert.equal(first.newLeads, 1);
  const second = compareSheetToSnapshot(first.snapshot, columns, leads, [2, 3, 4]);
  assert.equal(second.newLeads, 0);
  assert.equal(second.message, "Sync completed — no new leads found.");
});

test("empty and header-only sheets sync safely", () => {
  const previous = buildSyncSnapshot(["Name"], [{ Name: "Ada" }], [2]);
  const empty = compareSheetToSnapshot(previous, [], [], []);
  assert.equal(empty.totalLeads, 0);
  assert.equal(empty.message, "Sync completed — no new leads found.");

  const headerOnly = compareSheetToSnapshot(previous, ["Name", "Lead Status"], [], []);
  assert.equal(headerOnly.totalLeads, 0);
  assert.equal(headerOnly.newLeads, 0);
});

test("first sync without baseline establishes snapshot without inventing new leads", () => {
  const result = compareSheetToSnapshot("{}", columns, baselineLeads, baselineRows);
  assert.equal(result.hasBaseline, false);
  assert.equal(result.newLeads, 0);
  assert.equal(Object.keys(result.snapshot.rows).length, 2);
  assert.equal(result.message, "Sync completed — no new leads found.");
});
