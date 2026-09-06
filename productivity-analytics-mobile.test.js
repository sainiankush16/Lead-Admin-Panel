"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const {
  ACTIVE_ANALYTICS_STATUSES,
  CLOSED_ANALYTICS_STATUSES,
  TOP_WORK_STAGE_PRIORITY,
  getActiveLeadCount,
  getClosedLeadCount,
  getConvertedLeadCount,
  getFollowUpCount,
  getUnknownLeadCount,
  getConversionRate,
  getTopWorkStage,
  getProjectWorkload,
  getTopProjectWorkload,
  getProductivityAnalytics,
  inventsProductivityScore,
  classifyLeadStatus
} = require("./mobile/utils/productivityAnalyticsCore");

function counts(partial = {}) {
  return {
    New: 0,
    Contacted: 0,
    Interested: 0,
    "Follow Up": 0,
    "Site Visit": 0,
    Converted: 0,
    "Not Interested": 0,
    Lost: 0,
    Unknown: 0,
    ...partial
  };
}

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

function lead(name, status) {
  return { Name: name, Phone: "9876543210", Email: "", "Lead Status": status };
}

test("Active count includes New Contacted Interested Follow Up Site Visit", () => {
  assert.deepEqual(ACTIVE_ANALYTICS_STATUSES, [
    "New",
    "Contacted",
    "Interested",
    "Follow Up",
    "Site Visit"
  ]);
  assert.equal(
    getActiveLeadCount(
      counts({ New: 1, Contacted: 2, Interested: 3, "Follow Up": 4, "Site Visit": 5 })
    ),
    15
  );
});

test("Active count excludes Converted Not Interested Lost Unknown", () => {
  assert.equal(
    getActiveLeadCount(
      counts({
        New: 1,
        Converted: 10,
        "Not Interested": 8,
        Lost: 7,
        Unknown: 6
      })
    ),
    1
  );
});

test("Closed count includes Converted Not Interested Lost", () => {
  assert.deepEqual(CLOSED_ANALYTICS_STATUSES, ["Converted", "Not Interested", "Lost"]);
  assert.equal(
    getClosedLeadCount(counts({ Converted: 2, "Not Interested": 3, Lost: 4, New: 9 })),
    9
  );
});

test("Converted count only counts Converted", () => {
  assert.equal(
    getConvertedLeadCount(
      counts({ Converted: 5, Interested: 4, "Site Visit": 3, "Not Interested": 2 })
    ),
    5
  );
});

test("Follow Up count only counts Follow Up", () => {
  assert.equal(
    getFollowUpCount(counts({ "Follow Up": 7, Interested: 4, New: 2 })),
    7
  );
});

test("Unknown count is separate", () => {
  assert.equal(getUnknownLeadCount(counts({ Unknown: 3, New: 1 })), 3);
  assert.equal(
    getUnknownLeadCount({ statuses: counts({ New: 1 }), unknownStatusCount: 4 }),
    4
  );
});

test("Conversion denominator and rate when denominator > 0", () => {
  const result = getConversionRate(
    counts({
      Converted: 8,
      New: 50,
      Contacted: 20,
      Interested: 10,
      "Follow Up": 5,
      "Site Visit": 5,
      "Not Interested": 1,
      Lost: 1,
      Unknown: 99
    })
  );
  // Active = 90, closed non-converted = 2, converted = 8 => denom 100
  assert.equal(result.available, true);
  assert.equal(result.numerator, 8);
  assert.equal(result.denominator, 100);
  assert.equal(result.percent, 8);
  assert.equal(result.display, "8%");
  assert.equal(result.isPrediction, false);
  assert.equal(result.isForecast, false);
  assert.equal(result.isProbability, false);
  assert.match(result.label, /Conversion Rate/);
  assert.doesNotMatch(result.label, /Probability|Forecast|Prediction/i);
});

test("Conversion rate unavailable when denominator is zero", () => {
  const result = getConversionRate(counts({ Unknown: 5 }));
  assert.equal(result.available, false);
  assert.equal(result.rate, null);
  assert.equal(result.percent, null);
  assert.equal(result.display, "—");
  assert.equal(result.label, "Conversion Rate: —");
});

test("Unknown is not included in conversion denominator", () => {
  const result = getConversionRate(counts({ Converted: 1, New: 1, Unknown: 100 }));
  assert.equal(result.denominator, 2);
  assert.equal(result.percent, 50);
});

test("Top Work Stage prioritizes Follow Up on ties", () => {
  assert.deepEqual(TOP_WORK_STAGE_PRIORITY, [
    "Follow Up",
    "Interested",
    "Site Visit",
    "New",
    "Contacted"
  ]);
  const tied = getTopWorkStage(counts({ "Follow Up": 5, Interested: 5, New: 5 }));
  assert.equal(tied.status, "Follow Up");
  assert.equal(tied.count, 5);
});

test("Top Work Stage falls back through priority when counts differ", () => {
  assert.equal(getTopWorkStage(counts({ Interested: 9, New: 3 })).status, "Interested");
  assert.equal(getTopWorkStage(counts({ "Site Visit": 8, New: 3 })).status, "Site Visit");
  assert.equal(getTopWorkStage(counts({ New: 20, Contacted: 10 })).status, "New");
  assert.equal(getTopWorkStage(counts({ Contacted: 4 })).status, "Contacted");
});

test("No active stages returns no top stage", () => {
  const result = getTopWorkStage(counts({ Converted: 2, Lost: 1, Unknown: 3 }));
  assert.equal(result.available, false);
  assert.equal(result.status, null);
  assert.equal(result.count, 0);
});

test("Project workload is calculated correctly", () => {
  const projects = [
    project({
      id: 1,
      name: "Mayur City",
      leads: [
        lead("A", "New"),
        lead("B", "Follow Up"),
        lead("C", "Follow Up"),
        lead("D", "Converted"),
        lead("E", "Lost"),
        lead("F", "")
      ]
    }),
    project({
      id: 2,
      name: "Advitya Techno Park",
      leads: [lead("G", "Interested"), lead("H", "Contacted"), lead("I", "Converted")]
    })
  ];
  const workload = getProjectWorkload(projects);
  assert.equal(workload.length, 2);
  const mayur = workload.find(p => p.projectName === "Mayur City");
  const advitya = workload.find(p => p.projectName === "Advitya Techno Park");
  assert.equal(mayur.active, 3);
  assert.equal(mayur.followUp, 2);
  assert.equal(mayur.converted, 1);
  assert.equal(mayur.unknown, 1);
  assert.equal(mayur.totalLeads, 6);
  assert.equal(advitya.active, 2);
  assert.equal(advitya.followUp, 0);
  assert.equal(advitya.converted, 1);
});

test("Top project uses highest active workload with deterministic tie-break", () => {
  const projects = [
    project({
      id: 10,
      name: "Zebra Park",
      leads: [lead("A", "New"), lead("B", "New")]
    }),
    project({
      id: 20,
      name: "Alpha City",
      leads: [lead("C", "New"), lead("D", "New")]
    }),
    project({
      id: 30,
      name: "Mayur City",
      leads: [lead("E", "New"), lead("F", "New"), lead("G", "New")]
    })
  ];
  const top = getTopProjectWorkload(projects);
  assert.equal(top.available, true);
  assert.equal(top.projectName, "Mayur City");
  assert.equal(top.active, 3);

  const tied = getTopProjectWorkload([
    project({
      id: 1,
      name: "Alpha City",
      leads: [lead("A", "New"), lead("B", "New")]
    }),
    project({
      id: 2,
      name: "Beta City",
      leads: [lead("C", "New"), lead("D", "New")]
    })
  ]);
  // Same active; keep first in existing name-sorted order (Alpha before Beta).
  assert.equal(tied.projectName, "Alpha City");
  assert.equal(tied.active, 2);
});

test("Empty null undefined inputs are handled safely", () => {
  assert.equal(getActiveLeadCount(null), 0);
  assert.equal(getActiveLeadCount(undefined), 0);
  assert.equal(getActiveLeadCount([]), 0);
  assert.equal(getClosedLeadCount(null), 0);
  assert.equal(getConversionRate(null).available, false);
  assert.equal(getTopWorkStage(undefined).available, false);
  assert.deepEqual(getProjectWorkload(null), []);
  assert.deepEqual(getProjectWorkload(undefined), []);
  assert.deepEqual(getProjectWorkload([]), []);
  assert.equal(getTopProjectWorkload([]).available, false);
  const empty = getProductivityAnalytics([]);
  assert.equal(empty.empty, true);
  assert.equal(empty.emptyLabel, "No productivity data yet");
  assert.equal(empty.conversion.display, "—");
});

test("Blank status becomes Unknown and does not become active", () => {
  assert.equal(classifyLeadStatus(""), "Unknown");
  assert.equal(classifyLeadStatus("   "), "Unknown");
  assert.equal(classifyLeadStatus(null), "Unknown");
  const analytics = getProductivityAnalytics([
    project({
      id: 1,
      name: "P",
      leads: [lead("Blank", ""), lead("Weird", "Pending"), lead("Ok", "New")]
    })
  ]);
  assert.equal(analytics.active, 1);
  assert.equal(analytics.unknown, 2);
});

test("Input arrays and lead objects are not mutated", () => {
  const projects = [
    project({
      id: 1,
      name: "P",
      leads: [lead("A", "New"), lead("B", "Follow Up")]
    })
  ];
  const snapshot = JSON.stringify(projects);
  getProductivityAnalytics(projects);
  getProjectWorkload(projects);
  getTopProjectWorkload(projects);
  assert.equal(JSON.stringify(projects), snapshot);

  const flat = counts({ New: 1, Converted: 2 });
  const flatSnap = JSON.stringify(flat);
  getActiveLeadCount(flat);
  getConversionRate(flat);
  getTopWorkStage(flat);
  assert.equal(JSON.stringify(flat), flatSnap);
});

test("No predictive score probability or forecast is produced", () => {
  const analytics = getProductivityAnalytics([
    project({
      id: 1,
      name: "P",
      leads: [lead("A", "Converted"), lead("B", "New")]
    })
  ]);
  assert.equal(analytics.inventsScore, false);
  assert.equal(analytics.inventsForecast, false);
  assert.equal(analytics.inventsProbability, false);
  assert.equal(analytics.isPrediction, false);
  assert.equal(inventsProductivityScore(), false);
  const json = JSON.stringify(analytics);
  assert.equal(Object.prototype.hasOwnProperty.call(analytics, "score"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(analytics, "probability"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(analytics, "forecast"), false);
  assert.doesNotMatch(json, /conversionProbability|AI Forecast|Expected Revenue|Predicted/i);
});

test("Metrics remain deterministic", () => {
  const projects = [
    project({
      id: 1,
      name: "P",
      leads: [
        lead("A", "Follow Up"),
        lead("B", "Interested"),
        lead("C", "Converted"),
        lead("D", "New")
      ]
    })
  ];
  const a = getProductivityAnalytics(projects);
  const b = getProductivityAnalytics(projects);
  assert.deepEqual(
    {
      active: a.active,
      closed: a.closed,
      converted: a.converted,
      followUp: a.followUp,
      conversion: a.conversion.percent,
      topStage: a.topWorkStage.status,
      topProject: a.topProject.projectName
    },
    {
      active: b.active,
      closed: b.closed,
      converted: b.converted,
      followUp: b.followUp,
      conversion: b.conversion.percent,
      topStage: b.topWorkStage.status,
      topProject: b.topProject.projectName
    }
  );
});

test("Dashboard wires Productivity Overview without backend analytics APIs", () => {
  const root = __dirname;
  const dashboard = fs.readFileSync(path.join(root, "mobile/app/(app)/index.tsx"), "utf8");
  const card = fs.readFileSync(
    path.join(root, "mobile/components/ProductivityOverviewCard.tsx"),
    "utf8"
  );
  const api = fs.readFileSync(path.join(root, "mobile/services/api.ts"), "utf8");
  const server = fs.readFileSync(path.join(root, "server.js"), "utf8");
  const db = fs.readFileSync(path.join(root, "db.js"), "utf8");
  const pkg = fs.readFileSync(path.join(root, "mobile/package.json"), "utf8");

  assert.match(dashboard, /ProductivityOverviewCard/);
  assert.match(dashboard, /getProductivityAnalytics/);
  assert.match(dashboard, /ActionCenterSection/);
  assert.match(dashboard, /PipelineSummaryCard/);
  assert.match(dashboard, /getActionCenterSummary/);
  assert.doesNotMatch(dashboard, /openai|anthropic|llm|forecast|probability/i);
  assert.doesNotMatch(dashboard, /expo-notifications|reminder|calendar/i);

  assert.match(card, /Productivity Overview/);
  assert.match(card, /Conversion Rate/);
  assert.match(card, /Project Workload/);
  assert.match(card, /not a forecast or probability/i);
  assert.doesNotMatch(card, /Conversion Probability|AI Forecast|Expected Revenue/i);

  assert.doesNotMatch(api, /\/api\/analytics|\/api\/productivity-analytics|\/api\/forecast/);
  assert.doesNotMatch(server, /\/api\/analytics|\/api\/productivity-analytics|\/api\/forecast/);
  assert.doesNotMatch(db, /CREATE TABLE\s+(analytics|forecasts|productivity_metrics)/i);
  assert.doesNotMatch(pkg, /openai|tensorflow|@react-native-firebase\/messaging/);
});
