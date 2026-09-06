"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const {
  getActionPriority,
  isActionCenterStatus,
  collectActionCenterItems,
  getActionCenterCounts,
  getActionCenterPriority,
  getActionCenterItems,
  getActionCenterSummary,
  inventsActionScore,
  ACTION_CENTER_STATUSES,
  ACTION_CENTER_VISIBLE_LIMIT
} = require("./mobile/utils/actionCenterCore");

function project(partial) {
  return {
    sheetName: "Leads",
    spreadsheetId: "hidden",
    spreadsheetName: "Sheet",
    sheetId: 1,
    columns: ["Name", "Phone", "Email", "Lead Status"],
    lastSync: null,
    rowNumbers: (partial.leads || []).map((_, i) => i + 2),
    leadStatusColumn: "Lead Status",
    ...partial
  };
}

test("action priority order is Follow Up Interested Site Visit New Contacted", () => {
  assert.equal(getActionPriority("Follow Up"), 1);
  assert.equal(getActionPriority("Interested"), 2);
  assert.equal(getActionPriority("Site Visit"), 3);
  assert.equal(getActionPriority("New"), 4);
  assert.equal(getActionPriority("Contacted"), 5);
  assert.equal(getActionPriority("Converted"), null);
  assert.equal(getActionPriority("Not Interested"), null);
  assert.equal(getActionPriority("Lost"), null);
  assert.equal(getActionPriority("Unknown"), null);
  assert.equal(getActionPriority(""), null);
  assert.equal(getActionPriority(null), null);
  assert.equal(isActionCenterStatus("Follow Up"), true);
  assert.equal(isActionCenterStatus("Converted"), false);
  assert.deepEqual(ACTION_CENTER_STATUSES, [
    "Follow Up",
    "Interested",
    "Site Visit",
    "New",
    "Contacted"
  ]);
});

test("action center excludes terminal and unknown statuses", () => {
  const items = collectActionCenterItems([
    project({
      id: 1,
      name: "Alpha",
      leads: [
        { Name: "A", Phone: "9876543210", Email: "", "Lead Status": "Follow Up" },
        { Name: "B", Phone: "", Email: "b@x.com", "Lead Status": "Converted" },
        { Name: "C", Phone: "", Email: "", "Lead Status": "Not Interested" },
        { Name: "D", Phone: "", Email: "", "Lead Status": "Lost" },
        { Name: "E", Phone: "", Email: "", "Lead Status": "" },
        { Name: "F", Phone: "", Email: "", "Lead Status": "Pending" }
      ]
    })
  ]);
  assert.equal(items.length, 1);
  assert.equal(items[0].status, "Follow Up");
  assert.equal(items[0].rowNumber, 2);
  assert.equal(items[0].projectId, 1);
});

test("empty input and mutation safety", () => {
  assert.deepEqual(getActionCenterSummary([]).empty, true);
  assert.equal(getActionCenterSummary([]).emptyLabel, "No leads currently require action");
  assert.doesNotThrow(() => getActionCenterSummary(null));
  assert.doesNotThrow(() => getActionCenterSummary(undefined));
  assert.doesNotThrow(() => getActionPriority(undefined));

  const source = [
    project({
      id: 9,
      name: "West",
      leads: [{ Name: "Rahul", Phone: "9876543210", Email: "", "Lead Status": "New" }]
    })
  ];
  const frozen = JSON.parse(JSON.stringify(source));
  getActionCenterSummary(source);
  assert.deepEqual(source, frozen);
  assert.equal(inventsActionScore(), false);
});

test("counts and priority fall through correctly", () => {
  const items = collectActionCenterItems([
    project({
      id: 1,
      name: "A",
      leads: [
        { Name: "1", Phone: "1", Email: "", "Lead Status": "New" },
        { Name: "2", Phone: "1", Email: "", "Lead Status": "New" },
        { Name: "3", Phone: "1", Email: "", "Lead Status": "Interested" },
        { Name: "4", Phone: "1", Email: "", "Lead Status": "Site Visit" },
        { Name: "5", Phone: "1", Email: "", "Lead Status": "Contacted" }
      ]
    }),
    project({
      id: 2,
      name: "B",
      leads: [
        { Name: "6", Phone: "1", Email: "", "Lead Status": "Follow Up" },
        { Name: "7", Phone: "1", Email: "", "Lead Status": "Follow Up" }
      ]
    })
  ]);

  const counts = getActionCenterCounts(items);
  assert.equal(counts["Follow Up"], 2);
  assert.equal(counts.Interested, 1);
  assert.equal(counts["Site Visit"], 1);
  assert.equal(counts.New, 2);
  assert.equal(counts.Contacted, 1);
  assert.equal(counts.total, 7);

  assert.equal(getActionCenterPriority(counts).status, "Follow Up");
  assert.match(getActionCenterPriority(counts).label, /Priority: Follow Up/);

  assert.equal(
    getActionCenterPriority({
      "Follow Up": 0,
      Interested: 3,
      "Site Visit": 1,
      New: 5,
      Contacted: 2,
      total: 11
    }).status,
    "Interested"
  );
  assert.equal(
    getActionCenterPriority({
      "Follow Up": 0,
      Interested: 0,
      "Site Visit": 2,
      New: 5,
      Contacted: 2,
      total: 9
    }).status,
    "Site Visit"
  );
  assert.equal(
    getActionCenterPriority({
      "Follow Up": 0,
      Interested: 0,
      "Site Visit": 0,
      New: 4,
      Contacted: 1,
      total: 5
    }).status,
    "New"
  );
  assert.equal(
    getActionCenterPriority({
      "Follow Up": 0,
      Interested: 0,
      "Site Visit": 0,
      New: 0,
      Contacted: 0,
      total: 0
    }).label,
    "No leads currently require action"
  );
});

test("visible item limit and missing fields are handled", () => {
  const leads = [];
  for (let i = 0; i < 8; i += 1) {
    leads.push({
      Name: i === 0 ? "" : `Lead ${i}`,
      Phone: i === 1 ? "" : "9876543210",
      Email: i === 1 ? "a@x.com" : "",
      "Lead Status": "Follow Up"
    });
  }
  const projects = [project({ id: 3, name: "Mayur City", leads })];
  const summary = getActionCenterSummary(projects, { limit: ACTION_CENTER_VISIBLE_LIMIT });
  assert.equal(summary.visibleItems.length, 5);
  assert.equal(summary.totalMatching, 8);
  assert.equal(summary.hasMore, true);
  assert.ok(summary.visibleItems.every(item => item.detailHref.includes("/lead/")));
  assert.ok(collectActionCenterItems(projects).some(item => item.name === "Unnamed Lead"));

  const limited = getActionCenterItems(collectActionCenterItems(projects), {
    filter: "Follow Up",
    limit: 3
  });
  assert.equal(limited.items.length, 3);
  assert.equal(limited.hasMore, true);

  const phoneMissing = collectActionCenterItems(projects).find(item => item.name === "Lead 1");
  assert.ok(phoneMissing);
  assert.equal(phoneMissing.phoneAvailable, false);
  assert.equal(phoneMissing.emailAvailable, true);
  assert.equal(phoneMissing.contactLabel, "Email available");
});

test("sorting prioritizes Follow Up before New across projects", () => {
  const items = collectActionCenterItems([
    project({
      id: 1,
      name: "Zeta",
      leads: [{ Name: "New Lead", Phone: "1", Email: "", "Lead Status": "New" }]
    }),
    project({
      id: 2,
      name: "Alpha",
      leads: [{ Name: "Follow Lead", Phone: "1", Email: "", "Lead Status": "Follow Up" }]
    })
  ]);
  assert.equal(items[0].status, "Follow Up");
  assert.equal(items[1].status, "New");
  assert.doesNotMatch(JSON.stringify(items), /%|probability|score:\s*\d/i);
});

test("Dashboard wires Action Center without new APIs or notifications", () => {
  const dashboard = fs.readFileSync(path.join(__dirname, "mobile/app/(app)/index.tsx"), "utf8");
  const service = fs.readFileSync(path.join(__dirname, "mobile/services/dashboard.ts"), "utf8");
  const section = fs.readFileSync(
    path.join(__dirname, "mobile/components/ActionCenterSection.tsx"),
    "utf8"
  );
  const api = fs.readFileSync(path.join(__dirname, "mobile/services/api.ts"), "utf8");
  const server = fs.readFileSync(path.join(__dirname, "server.js"), "utf8");
  const db = fs.readFileSync(path.join(__dirname, "db.js"), "utf8");
  const pkg = fs.readFileSync(path.join(__dirname, "mobile/package.json"), "utf8");
  const list = fs.readFileSync(
    path.join(__dirname, "mobile/app/(app)/projects/[projectId]/index.tsx"),
    "utf8"
  );
  const detail = fs.readFileSync(
    path.join(__dirname, "mobile/app/(app)/projects/[projectId]/lead/[rowNumber].tsx"),
    "utf8"
  );
  const search = fs.readFileSync(path.join(__dirname, "mobile/app/(app)/search.tsx"), "utf8");

  assert.match(dashboard, /ActionCenterSection/);
  assert.match(dashboard, /getActionCenterSummary/);
  assert.match(dashboard, /PipelineSummaryCard/);
  assert.match(dashboard, /Actionable Leads/);
  assert.match(dashboard, /PROJECT_FETCH_CONCURRENCY|mapPool|loadDashboardSummary/);
  assert.match(dashboard, /detailHref|onOpenLead/);
  assert.doesNotMatch(dashboard, /CHATURX|ChaturX|Ankush CRM/);
  assert.doesNotMatch(dashboard, /expo-notifications|reminder|calendar|followUpAt/i);

  assert.match(service, /PROJECT_FETCH_CONCURRENCY = 4/);
  assert.match(service, /projectLeads/);
  assert.match(service, /buildDashboardSummary/);

  assert.match(section, /Action Center/);
  assert.match(section, /Needs Attention/);
  assert.match(section, /summary\.emptyLabel|No leads match this filter/);
  assert.doesNotMatch(section, /updateLeadStatus/);

  assert.doesNotMatch(api, /\/api\/action-center|\/api\/follow-ups|\/api\/queue/);
  assert.doesNotMatch(server, /\/api\/action-center|\/api\/follow-ups/);
  assert.doesNotMatch(db, /CREATE TABLE\s+(action_center|follow_ups|reminders)/i);
  assert.doesNotMatch(pkg, /expo-notifications|openai|firebase/);

  assert.match(list, /Bulk Status|selectionMode/);
  assert.match(detail, /LeadIntelligenceSummary|LeadSmartNextAction/);
  assert.match(search, /Clear Filters/);
});
