"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const {
  getLeadConversionReadiness,
  getLeadProgress,
  getLeadStageSummary,
  getLeadQualificationSignals,
  getLeadMissingInformation,
  getLeadActivityIntelligence,
  getLeadRemarksIntelligence,
  getLeadIntelligence,
  hasUsableName,
  hasUsablePhoneValue,
  hasUsableEmailValue,
  inventsConversionScore,
  CONVERSION_PROGRESS_STAGES,
  TERMINAL_STATUSES
} = require("./mobile/utils/leadIntelligenceCore");
const { WORKFLOW_SECTIONS } = require("./mobile/utils/leadWorkflowCore");

test("conversion readiness maps each status deterministically", () => {
  assert.equal(getLeadConversionReadiness("New"), "Early Stage");
  assert.equal(getLeadConversionReadiness("Contacted"), "Engaged");
  assert.equal(getLeadConversionReadiness("Interested"), "Engaged");
  assert.equal(getLeadConversionReadiness("Follow Up"), "Action Required");
  assert.equal(getLeadConversionReadiness("Site Visit"), "Action Required");
  assert.equal(getLeadConversionReadiness("Converted"), "Converted");
  assert.equal(getLeadConversionReadiness("Not Interested"), "Closed / Not Interested");
  assert.equal(getLeadConversionReadiness("Lost"), "Closed / Lost");
  assert.equal(getLeadConversionReadiness(""), "Unknown");
  assert.equal(getLeadConversionReadiness("Unknown"), "Unknown");
  assert.equal(getLeadConversionReadiness(null), "Unknown");
});

test("progress indicator handles progression terminal and unknown", () => {
  assert.deepEqual(CONVERSION_PROGRESS_STAGES, [
    "New",
    "Contacted",
    "Interested",
    "Follow Up",
    "Site Visit",
    "Converted"
  ]);
  assert.ok(TERMINAL_STATUSES.includes("Not Interested"));
  assert.ok(TERMINAL_STATUSES.includes("Lost"));

  const interested = getLeadProgress("Interested");
  assert.equal(interested.kind, "progress");
  assert.equal(interested.currentIndex, 2);
  assert.equal(interested.description, "Lead has shown interest.");

  const terminal = getLeadProgress("Lost");
  assert.equal(terminal.kind, "terminal");
  assert.equal(terminal.terminalStatus, "Lost");
  assert.equal(terminal.currentIndex, -1);

  const unknown = getLeadProgress("");
  assert.equal(unknown.kind, "unknown");
  assert.equal(unknown.unavailableLabel, "Lead stage unavailable");
  assert.equal(getLeadStageSummary("New"), "Lead has not been progressed yet.");
});

test("phone email and name availability signals", () => {
  assert.equal(hasUsablePhoneValue({ phone: "9876543210" }), true);
  assert.equal(hasUsablePhoneValue({ phone: "", telHref: null }), false);
  assert.equal(hasUsableEmailValue({ email: "a@x.com" }), true);
  assert.equal(hasUsableEmailValue({ email: "not-an-email" }), false);
  assert.equal(hasUsableName("Anshul"), true);
  assert.equal(hasUsableName("Unnamed Lead"), false);
  assert.equal(hasUsableName(""), false);

  const signals = getLeadQualificationSignals({
    name: "Anshul",
    phone: "9876543210",
    email: "a@x.com",
    timelineEvents: [{ eventType: "STATUS_CHANGED" }],
    remarks: [{ id: 1 }]
  });
  assert.equal(signals.phoneAvailable, true);
  assert.equal(signals.emailAvailable, true);
  assert.equal(signals.nameAvailable, true);
  assert.equal(signals.phoneLabel, "Phone available");
  assert.equal(signals.emailLabel, "Email available");
});

test("missing contact information is reported safely", () => {
  const missingBoth = getLeadMissingInformation({
    name: "",
    phone: "",
    email: "",
    telHref: null,
    mailtoHref: null
  });
  assert.equal(missingBoth.contactComplete, false);
  assert.ok(missingBoth.items.includes("Phone number missing"));
  assert.ok(missingBoth.items.includes("Email missing"));

  const complete = getLeadMissingInformation({
    name: "Anshul",
    phone: "9876543210",
    email: "a@x.com",
    telHref: "tel:+919876543210",
    mailtoHref: "mailto:a@x.com"
  });
  assert.equal(complete.contactComplete, true);
  assert.equal(complete.summary, "Contact information complete");
  assert.equal(complete.items.length, 0);

  const phoneOnly = getLeadMissingInformation({
    name: "Anshul",
    phone: "9876543210",
    email: "",
    telHref: "tel:+919876543210",
    mailtoHref: null
  });
  assert.equal(phoneOnly.contactComplete, true);
  assert.equal(phoneOnly.summary, "Contact information complete");
});

test("activity and remarks counts are factual", () => {
  assert.equal(getLeadActivityIntelligence(null).summary, "Activity unavailable");
  assert.equal(getLeadActivityIntelligence([]).summary, "No activity yet");
  const activity = getLeadActivityIntelligence([
    { eventType: "STATUS_CHANGED" },
    { eventType: "REMARK_ADDED", isDeleted: true },
    { eventType: "CUSTOM_X" }
  ]);
  assert.equal(activity.count, 2);
  assert.match(activity.summary, /Last: Status Changed/);

  assert.equal(getLeadRemarksIntelligence(null).summary, "Remarks unavailable");
  assert.equal(getLeadRemarksIntelligence([]).summary, "No remarks yet");
  assert.equal(getLeadRemarksIntelligence([{ id: 1 }, { id: 2 }, { id: 3 }]).summary, "3 remarks");
});

test("getLeadIntelligence does not mutate inputs or invent scores", () => {
  const timeline = [{ eventType: "LEAD_GENERATED" }];
  const remarks = [{ id: 9 }];
  const input = {
    status: "Follow Up",
    name: "Rahul",
    phone: "9876543210",
    email: "",
    telHref: "tel:+919876543210",
    mailtoHref: null,
    timelineEvents: timeline,
    remarks
  };
  const frozen = JSON.parse(JSON.stringify(input));
  const result = getLeadIntelligence(input);
  assert.deepEqual(input, frozen);
  assert.deepEqual(timeline, frozen.timelineEvents);
  assert.deepEqual(remarks, frozen.remarks);
  assert.equal(result.readiness, "Action Required");
  assert.equal(result.inventsConversionScore, false);
  assert.equal(inventsConversionScore(), false);
  assert.doesNotMatch(JSON.stringify(result), /%|probability|score:\s*\d/i);
});

test("null undefined inputs do not throw", () => {
  assert.doesNotThrow(() => getLeadIntelligence());
  assert.doesNotThrow(() => getLeadIntelligence({}));
  assert.doesNotThrow(() => getLeadProgress(undefined));
  assert.doesNotThrow(() => getLeadQualificationSignals(undefined));
  assert.doesNotThrow(() => getLeadActivityIntelligence(undefined));
  assert.doesNotThrow(() => getLeadRemarksIntelligence(undefined));
});

test("Lead Detail wires intelligence without AI backend or fake scoring", () => {
  const detail = fs.readFileSync(
    path.join(__dirname, "mobile/app/(app)/projects/[projectId]/lead/[rowNumber].tsx"),
    "utf8"
  );
  const card = fs.readFileSync(
    path.join(__dirname, "mobile/components/LeadIntelligenceSummary.tsx"),
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
  const search = fs.readFileSync(path.join(__dirname, "mobile/app/(app)/search.tsx"), "utf8");

  assert.equal(WORKFLOW_SECTIONS[1], "intelligence");
  assert.match(detail, /LeadIntelligenceSummary/);
  assert.match(detail, /LeadSmartNextAction/);
  assert.match(detail, /LeadFollowUpSection/);
  assert.match(detail, /LeadContactActions/);
  assert.match(detail, /getLeadTimeline/);
  assert.doesNotMatch(detail, /openai|anthropic|llm|probability|conversionScore/i);
  assert.doesNotMatch(detail, /expo-notifications|reminder|calendar|followUpAt/i);
  assert.doesNotMatch(detail, /CHATURX|ChaturX|Ankush CRM/);

  assert.match(card, /Lead Intelligence/);
  assert.match(card, /getLeadIntelligence/);
  assert.match(card, /Conversion progress|Lead stage unavailable/);
  assert.doesNotMatch(card, /%\s*likely|conversion probability|Lead Score/i);

  assert.doesNotMatch(api, /\/api\/intelligence|\/api\/lead-score|\/api\/predictions/);
  assert.doesNotMatch(server, /\/api\/intelligence|\/api\/lead-score/);
  assert.doesNotMatch(db, /CREATE TABLE\s+(lead_scores|intelligence|predictions)/i);
  assert.doesNotMatch(pkg, /openai|anthropic|expo-notifications/);

  assert.match(list, /Bulk Status|runBulkLeadStatusUpdates/);
  assert.match(search, /Clear Filters/);
});
