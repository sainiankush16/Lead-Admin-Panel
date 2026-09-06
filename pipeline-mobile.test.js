"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const {
  getPipelineCounts,
  getNextPipelineStage,
  getAttentionStage,
  getPipelineHealth,
  getPipelineConversionContext,
  getPipelineSummary,
  resolvePipelineLeadTarget,
  inventsPipelineScore,
  ACTIVE_PIPELINE_STAGES,
  TERMINAL_PIPELINE_STAGES
} = require("./mobile/utils/pipelineCore");
const { buildDashboardSummary } = require("./mobile/utils/dashboardSummaryCore");

test("pipeline counts cover all statuses including Unknown", () => {
  const leads = [
    { status: "New" },
    { status: "New" },
    { status: "Contacted" },
    { status: "Interested" },
    { status: "Follow Up" },
    { status: "Site Visit" },
    { status: "Converted" },
    { status: "Not Interested" },
    { status: "Lost" },
    { status: "" },
    { status: "Pending" }
  ];
  const counts = getPipelineCounts(leads);
  assert.equal(counts.statuses.New, 2);
  assert.equal(counts.statuses.Contacted, 1);
  assert.equal(counts.statuses.Interested, 1);
  assert.equal(counts.statuses["Follow Up"], 1);
  assert.equal(counts.statuses["Site Visit"], 1);
  assert.equal(counts.statuses.Converted, 1);
  assert.equal(counts.statuses["Not Interested"], 1);
  assert.equal(counts.statuses.Lost, 1);
  assert.equal(counts.unknownStatusCount, 2);
  assert.equal(counts.total, 11);
});

test("empty and null inputs are safe and do not mutate", () => {
  const empty = getPipelineCounts([]);
  assert.equal(empty.total, 0);
  assert.equal(empty.statuses.New, 0);

  const source = [{ status: "New" }, { status: "Contacted" }];
  const frozen = JSON.parse(JSON.stringify(source));
  getPipelineCounts(source);
  assert.deepEqual(source, frozen);

  assert.doesNotThrow(() => getPipelineCounts(null));
  assert.doesNotThrow(() => getAttentionStage(undefined));
  assert.doesNotThrow(() => getPipelineHealth(null));
  assert.doesNotThrow(() => getNextPipelineStage(undefined));
});

test("next pipeline stage mapping", () => {
  assert.equal(getNextPipelineStage("New"), "Contacted");
  assert.equal(getNextPipelineStage("Contacted"), "Interested");
  assert.equal(getNextPipelineStage("Interested"), "Follow Up");
  assert.equal(getNextPipelineStage("Follow Up"), "Site Visit");
  assert.equal(getNextPipelineStage("Site Visit"), "Converted");
  assert.equal(getNextPipelineStage("Converted"), null);
  assert.equal(getNextPipelineStage("Not Interested"), null);
  assert.equal(getNextPipelineStage("Lost"), null);
  assert.equal(getNextPipelineStage("Unknown"), null);
  assert.equal(getNextPipelineStage(""), null);
});

test("attention stage prioritizes Follow Up then Interested", () => {
  const withFollowUp = getAttentionStage({
    statuses: {
      New: 20,
      Contacted: 5,
      Interested: 8,
      "Follow Up": 12,
      "Site Visit": 3,
      Converted: 1,
      "Not Interested": 0,
      Lost: 0
    },
    unknownStatusCount: 0
  });
  assert.equal(withFollowUp.status, "Follow Up");
  assert.equal(withFollowUp.count, 12);
  assert.match(withFollowUp.label, /Follow Up — 12 leads/);

  const withoutFollowUp = getAttentionStage({
    statuses: {
      New: 20,
      Contacted: 5,
      Interested: 8,
      "Follow Up": 0,
      "Site Visit": 3,
      Converted: 1,
      "Not Interested": 0,
      Lost: 0
    },
    unknownStatusCount: 0
  });
  assert.equal(withoutFollowUp.status, "Interested");
  assert.equal(withoutFollowUp.count, 8);

  const none = getAttentionStage({
    statuses: {
      New: 0,
      Contacted: 0,
      Interested: 0,
      "Follow Up": 0,
      "Site Visit": 0,
      Converted: 2,
      "Not Interested": 1,
      Lost: 1
    },
    unknownStatusCount: 0
  });
  assert.equal(none.status, null);
  assert.equal(none.label, "Pipeline has no active leads");
});

test("pipeline health and conversion context remain factual", () => {
  assert.equal(getPipelineHealth(null), "Pipeline data unavailable");
  assert.match(
    getPipelineHealth({
      statuses: { "Follow Up": 4, New: 1, Contacted: 0, Interested: 0, "Site Visit": 0, Converted: 0, "Not Interested": 0, Lost: 0 },
      unknownStatusCount: 0
    }),
    /Follow Up has 4 leads needing attention/
  );

  assert.equal(getPipelineConversionContext("Interested").nextStage, "Follow Up");
  assert.equal(getPipelineConversionContext("Follow Up").nextStageLabel, "Site Visit");
  assert.equal(getPipelineConversionContext("Site Visit").nextStage, "Converted");
  assert.equal(getPipelineConversionContext("Converted").nextStageLabel, "Pipeline complete");
  assert.equal(getPipelineConversionContext("Lost").nextStageLabel, "Pipeline closed");
  assert.equal(getPipelineConversionContext("").nextStageLabel, "Next stage unavailable");

  const summary = getPipelineSummary({
    statuses: { New: 1, Contacted: 0, Interested: 0, "Follow Up": 0, "Site Visit": 0, Converted: 0, "Not Interested": 2, Lost: 0 },
    unknownStatusCount: 1
  });
  assert.deepEqual(
    summary.active.map(item => item.status),
    ACTIVE_PIPELINE_STAGES
  );
  assert.ok(TERMINAL_PIPELINE_STAGES.every(status => summary.terminal.some(item => item.status === status)));
  assert.equal(summary.inventsScore, false);
  assert.equal(inventsPipelineScore(), false);
  assert.doesNotMatch(JSON.stringify(summary), /%|probability|score:\s*\d/i);
});

test("project-specific counts and dashboard target resolution", () => {
  const projectLeads = [
    { status: "Follow Up" },
    { status: "Follow Up" },
    { status: "New" }
  ];
  const counts = getPipelineCounts(projectLeads);
  assert.equal(counts.statuses["Follow Up"], 2);
  assert.equal(counts.statuses.New, 1);

  const dashboard = buildDashboardSummary([
    {
      id: 1,
      name: "West",
      leads: [
        { Name: "A", "Lead Status": "Follow Up" },
        { Name: "B", "Lead Status": "New" }
      ],
      columns: ["Name", "Lead Status"],
      leadStatusColumn: "Lead Status",
      rowNumbers: [2, 3]
    },
    {
      id: 2,
      name: "East",
      leads: [
        { Name: "C", "Lead Status": "Follow Up" },
        { Name: "D", "Lead Status": "Follow Up" },
        { Name: "E", "Lead Status": "Follow Up" }
      ],
      columns: ["Name", "Lead Status"],
      leadStatusColumn: "Lead Status",
      rowNumbers: [2, 3, 4]
    }
  ]);
  const target = resolvePipelineLeadTarget(dashboard, "Follow Up");
  assert.equal(target.projectId, 2);
  assert.equal(target.count, 3);
  assert.equal(target.path, "/projects/2?status=Follow%20Up");
});

test("mobile screens wire pipeline without AI or backend changes", () => {
  const dashboard = fs.readFileSync(path.join(__dirname, "mobile/app/(app)/index.tsx"), "utf8");
  const leadList = fs.readFileSync(
    path.join(__dirname, "mobile/app/(app)/projects/[projectId]/index.tsx"),
    "utf8"
  );
  const detail = fs.readFileSync(
    path.join(__dirname, "mobile/app/(app)/projects/[projectId]/lead/[rowNumber].tsx"),
    "utf8"
  );
  const intelligence = fs.readFileSync(
    path.join(__dirname, "mobile/components/LeadIntelligenceSummary.tsx"),
    "utf8"
  );
  const api = fs.readFileSync(path.join(__dirname, "mobile/services/api.ts"), "utf8");
  const server = fs.readFileSync(path.join(__dirname, "server.js"), "utf8");
  const db = fs.readFileSync(path.join(__dirname, "db.js"), "utf8");
  const pkg = fs.readFileSync(path.join(__dirname, "mobile/package.json"), "utf8");
  const search = fs.readFileSync(path.join(__dirname, "mobile/app/(app)/search.tsx"), "utf8");

  assert.match(dashboard, /PipelineSummaryCard/);
  assert.match(dashboard, /Sales Pipeline/);
  assert.match(dashboard, /resolvePipelineLeadTarget/);
  assert.match(dashboard, /Actionable Leads/);
  assert.match(dashboard, /resolveActionableLeadTarget/);

  assert.match(leadList, /PipelineSummaryCard/);
  assert.match(leadList, /getPipelineCounts/);
  assert.match(leadList, /selectionMode|Bulk Status|runBulkLeadStatusUpdates/);

  assert.match(detail, /LeadIntelligenceSummary/);
  assert.match(detail, /onSelectNextStage/);
  assert.match(detail, /Save Status/);
  assert.match(detail, /LeadSmartNextAction/);
  assert.match(detail, /LeadFollowUpSection/);
  assert.doesNotMatch(detail, /updateLeadStatus\([^\)]*nextStage/);

  assert.match(intelligence, /Typical next stage|Next stage/);
  assert.match(intelligence, /Save Status to apply/);
  assert.match(intelligence, /getPipelineConversionContext/);
  assert.doesNotMatch(intelligence, /updateLeadStatus/);

  assert.doesNotMatch(api, /\/api\/pipeline|\/api\/forecast|\/api\/lead-score/);
  assert.doesNotMatch(server, /\/api\/pipeline|\/api\/forecast/);
  assert.doesNotMatch(db, /CREATE TABLE\s+(pipeline|forecast|lead_scores)/i);
  assert.doesNotMatch(pkg, /openai|expo-notifications|firebase/);
  assert.match(search, /Clear Filters/);
  assert.doesNotMatch(dashboard, /CHATURX|ChaturX|Ankush CRM/);
});
