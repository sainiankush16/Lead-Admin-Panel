"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const {
  buildDashboardSummary,
  emptyActionableCounts,
  resolveActionableLeadTarget,
  normalizeLeadListStatusParam,
  buildLeadListPath,
  ACTIONABLE_STATUSES
} = require("./mobile/utils/dashboardSummaryCore");
const { filterLeadListItems } = require("./mobile/utils/leadListCore");

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

test("actionable counts map Follow Up New Interested Site Visit exactly", () => {
  const summary = buildDashboardSummary([
    project({
      id: 2,
      name: "Beta Park",
      leads: [
        { Name: "A", "Lead Status": "Follow Up" },
        { Name: "B", "Lead Status": "Follow Up" },
        { Name: "C", "Lead Status": "New" }
      ]
    }),
    project({
      id: 1,
      name: "Alpha Homes",
      leads: [
        { Name: "D", "Lead Status": "Interested" },
        { Name: "E", "Lead Status": "Site Visit" },
        { Name: "F", "Lead Status": "" },
        { Name: "G", "Lead Status": "Pending" }
      ]
    })
  ]);

  assert.equal(summary.totalLeads, 7);
  assert.equal(summary.actionable["Follow Up"], 2);
  assert.equal(summary.actionable.New, 1);
  assert.equal(summary.actionable.Interested, 1);
  assert.equal(summary.actionable["Site Visit"], 1);
  assert.equal(summary.unknownStatusCount, 2);
  assert.equal(summary.statuses.New, 1);
  assert.deepEqual(ACTIONABLE_STATUSES, ["Follow Up", "New", "Interested", "Site Visit"]);
  assert.deepEqual(emptyActionableCounts()["Follow Up"], 0);
});

test("project summaries include per-status counts for navigation", () => {
  const summary = buildDashboardSummary([
    project({
      id: 10,
      name: "West",
      leads: [
        { Name: "A", "Lead Status": "Follow Up" },
        { Name: "B", "Lead Status": "New" }
      ]
    }),
    project({
      id: 11,
      name: "East",
      leads: [
        { Name: "C", "Lead Status": "Follow Up" },
        { Name: "D", "Lead Status": "Follow Up" },
        { Name: "E", "Lead Status": "Follow Up" }
      ]
    })
  ]);

  const west = summary.projects.find(p => p.projectId === 10);
  const east = summary.projects.find(p => p.projectId === 11);
  assert.equal(west.statusCounts["Follow Up"], 1);
  assert.equal(east.statusCounts["Follow Up"], 3);

  const target = resolveActionableLeadTarget(summary, "Follow Up");
  assert.equal(target.projectId, 11);
  assert.equal(target.status, "Follow Up");
  assert.equal(target.count, 3);

  const zeroTarget = resolveActionableLeadTarget(
    buildDashboardSummary([project({ id: 1, name: "Only", leads: [] })]),
    "Follow Up"
  );
  assert.equal(zeroTarget.projectId, 1);
  assert.equal(zeroTarget.count, 0);
});

test("dashboard and lead list status filter navigation helpers", () => {
  assert.equal(normalizeLeadListStatusParam("Follow Up"), "Follow Up");
  assert.equal(normalizeLeadListStatusParam("All"), null);
  assert.equal(normalizeLeadListStatusParam("bogus"), null);
  assert.equal(normalizeLeadListStatusParam("Unknown"), "Unknown");
  assert.equal(buildLeadListPath(5, "Follow Up"), "/projects/5?status=Follow%20Up");
  assert.equal(buildLeadListPath(5, null), "/projects/5");
  assert.equal(buildLeadListPath(0, "New"), null);

  const items = [
    { name: "A", phone: "1", email: "", status: "Follow Up", lead: {}, columns: [] },
    { name: "B", phone: "2", email: "", status: "New", lead: {}, columns: [] },
    { name: "Callback", phone: "3", email: "", status: "Follow Up", lead: {}, columns: [] }
  ];
  const filtered = filterLeadListItems(items, { query: "Call", status: "Follow Up" });
  assert.equal(filtered.length, 1);
  assert.equal(filtered[0].name, "Callback");
  assert.equal(filterLeadListItems(items, { query: "", status: "All" }).length, 3);
});

test("Dashboard and Lead List wire actionable navigation without new APIs", () => {
  const dashboard = fs.readFileSync(path.join(__dirname, "mobile/app/(app)/index.tsx"), "utf8");
  const leadList = fs.readFileSync(
    path.join(__dirname, "mobile/app/(app)/projects/[projectId]/index.tsx"),
    "utf8"
  );
  const api = fs.readFileSync(path.join(__dirname, "mobile/services/api.ts"), "utf8");
  const server = fs.readFileSync(path.join(__dirname, "server.js"), "utf8");
  const db = fs.readFileSync(path.join(__dirname, "db.js"), "utf8");
  const pkg = fs.readFileSync(path.join(__dirname, "mobile/package.json"), "utf8");

  assert.match(dashboard, /Actionable Leads/);
  assert.match(dashboard, /ACTIONABLE_STATUSES/);
  assert.match(dashboard, /resolveActionableLeadTarget/);
  assert.match(dashboard, /normalizeLeadListStatusParam|buildLeadListPath/);
  assert.match(dashboard, /openProjectLeads/);
  assert.match(dashboard, /pathname:\s*["']\/projects\/\[projectId\]["']/);
  assert.match(dashboard, /getProductivityAnalytics|ProductivityOverviewCard/);
  assert.doesNotMatch(dashboard, /CHATURX|ChaturX|Ankush CRM/);
  assert.doesNotMatch(dashboard, /chart\.js|victory|recharts|firebase|expo-notifications/i);
  assert.doesNotMatch(dashboard, /conversionProbability|AI Forecast|Expected Revenue/i);

  assert.match(leadList, /normalizeLeadListStatusParam/);
  assert.match(leadList, /Status: \{status\}/);
  assert.match(leadList, /clearFilters/);
  assert.match(leadList, /filterLeadListItems/);
  assert.match(
    leadList,
    /pathname:\s*["']\/projects\/\[projectId\]\/lead\/\[rowNumber\]["']|leadListDetailHref\(projectId,\s*item\.rowNumber\)|router\.push\(`\/projects\/\$\{projectId\}\/lead\/\$\{item\.rowNumber\}`\)/
  );

  assert.doesNotMatch(api, /\/api\/dashboard|\/api\/analytics|\/api\/actionable/);
  assert.doesNotMatch(server, /app\.(get|post)\("\/api\/dashboard/);
  assert.doesNotMatch(db, /CREATE TABLE\s+(dashboard|analytics|actionable)/i);
  assert.doesNotMatch(pkg, /chart\.js|victory|recharts|firebase|expo-notifications/i);
});
