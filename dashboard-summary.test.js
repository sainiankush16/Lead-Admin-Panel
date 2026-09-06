"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  buildDashboardSummary,
  classifyLeadStatus,
  emptyStatusCounts,
  mapPool,
  statusFromLead
} = require("./mobile/utils/dashboardSummaryCore");

function project(partial) {
  return {
    sheetName: "Leads",
    spreadsheetId: "hidden",
    spreadsheetName: "Sheet",
    sheetId: 1,
    columns: ["Name", "Lead Status"],
    lastSync: null,
    rowNumbers: (partial.leads || []).map((_, i) => i + 2),
    leadStatusColumn: "Lead Status",
    leadStatusColumnIndex: 1,
    ...partial
  };
}

test("empty projects yield zero totals", () => {
  const summary = buildDashboardSummary([]);
  assert.equal(summary.totalLeads, 0);
  assert.deepEqual(summary.statuses, emptyStatusCounts());
  assert.equal(summary.hasProjects, false);
  assert.equal(summary.hasLeads, false);
});

test("projects with no leads are empty but listed", () => {
  const summary = buildDashboardSummary([project({ id: 1, name: "Alpha", leads: [] })]);
  assert.equal(summary.hasProjects, true);
  assert.equal(summary.hasLeads, false);
  assert.equal(summary.totalLeads, 0);
});

test("counts each exact status and aggregates across projects", () => {
  const summary = buildDashboardSummary([
    project({
      id: 2,
      name: "Mayur City",
      leads: [
        { Name: "A", "Lead Status": "New" },
        { Name: "B", "Lead Status": "Contacted" },
        { Name: "C", "Lead Status": "Follow Up" }
      ]
    }),
    project({
      id: 1,
      name: "Advitya Techno Park",
      leads: [
        { Name: "D", "Lead Status": "New" },
        { Name: "E", "Lead Status": "Converted" },
        { Name: "F", "Lead Status": "Site Visit" },
        { Name: "G", "Lead Status": "Interested" },
        { Name: "H", "Lead Status": "Not Interested" },
        { Name: "I", "Lead Status": "Lost" }
      ]
    })
  ]);

  assert.equal(summary.totalLeads, 9);
  assert.equal(summary.statuses.New, 2);
  assert.equal(summary.statuses.Contacted, 1);
  assert.equal(summary.statuses.Interested, 1);
  assert.equal(summary.statuses["Follow Up"], 1);
  assert.equal(summary.statuses["Site Visit"], 1);
  assert.equal(summary.statuses.Converted, 1);
  assert.equal(summary.statuses["Not Interested"], 1);
  assert.equal(summary.statuses.Lost, 1);
  assert.deepEqual(
    summary.projects.map(p => p.projectName),
    ["Advitya Techno Park", "Mayur City"]
  );
});

test("blank and unknown statuses are not counted as New", () => {
  assert.equal(classifyLeadStatus(""), "Unknown");
  assert.equal(classifyLeadStatus("new"), "Unknown");
  assert.equal(classifyLeadStatus("New"), "New");

  const summary = buildDashboardSummary([
    project({
      id: 3,
      name: "Beta",
      leads: [
        { Name: "A", "Lead Status": "" },
        { Name: "B", "Lead Status": "Pending" },
        { Name: "C", "Lead Status": "New" }
      ]
    })
  ]);
  assert.equal(summary.totalLeads, 3);
  assert.equal(summary.statuses.New, 1);
  assert.equal(summary.unknownStatusCount, 2);
});

test("missing lead status column counts leads as unknown status", () => {
  const summary = buildDashboardSummary([
    project({
      id: 4,
      name: "No Status Col",
      leadStatusColumn: null,
      leads: [{ Name: "Only Name" }, { Name: "Two" }]
    })
  ]);
  assert.equal(summary.totalLeads, 2);
  assert.equal(summary.unknownStatusCount, 2);
  assert.equal(summary.statuses.New, 0);
  assert.equal(statusFromLead({ Name: "x" }, null), "Unknown");
});

test("mapPool respects concurrency and preserves order", async () => {
  const result = await mapPool([1, 2, 3, 4, 5], 2, async n => n * 10);
  assert.deepEqual(result, [10, 20, 30, 40, 50]);
});
