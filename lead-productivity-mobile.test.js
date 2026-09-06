"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const {
  getLeadProductivityStatus,
  getRecommendedLeadAction,
  getPrimaryLeadAction,
  canShowSmartWhatsApp,
  getLeadActivitySummary,
  getQuickLeadStatusOptions,
  quickStatusSelectsOnly,
  contactActionsAutoChangeStatus,
  followUpActiveGuidance,
  buildLeadProductivitySummary,
  hasUsablePhone,
  hasUsableEmail
} = require("./mobile/utils/leadProductivityCore");
const { WORKFLOW_SECTIONS } = require("./mobile/utils/leadWorkflowCore");

const phone = "tel:+919876543210";
const wa = "https://wa.me/919876543210";
const mail = "mailto:a@x.com";

test("New lead with phone recommends contact/call", () => {
  assert.equal(getRecommendedLeadAction({ status: "New", telHref: phone, mailtoHref: null }), "Contact this lead");
  assert.deepEqual(getPrimaryLeadAction({ status: "New", telHref: phone, mailtoHref: null }), {
    type: "call",
    label: "Call Lead",
    href: phone
  });
  assert.equal(canShowSmartWhatsApp({ status: "New", waHref: wa }), true);
});

test("New lead without contact recommends review", () => {
  assert.equal(
    getRecommendedLeadAction({ status: "New", telHref: null, mailtoHref: null }),
    "Review lead details"
  );
  assert.deepEqual(getPrimaryLeadAction({ status: "New", telHref: null, mailtoHref: null }), {
    type: "review",
    label: "Review Lead",
    href: null
  });
  assert.equal(canShowSmartWhatsApp({ status: "New", waHref: null }), false);
});

test("Follow Up Interested Site Visit Contacted recommendations", () => {
  assert.equal(
    getRecommendedLeadAction({ status: "Follow Up", telHref: phone }),
    "Follow up with this lead"
  );
  assert.equal(getPrimaryLeadAction({ status: "Follow Up", telHref: phone }).type, "call");
  assert.equal(
    getRecommendedLeadAction({ status: "Interested", telHref: phone }),
    "Continue the conversation"
  );
  assert.equal(
    getRecommendedLeadAction({ status: "Site Visit", telHref: phone }),
    "Follow up on the site visit"
  );
  assert.equal(
    getRecommendedLeadAction({ status: "Contacted", telHref: phone }),
    "Continue follow-up"
  );
});

test("Converted and Not Interested avoid misleading communication CTAs", () => {
  assert.equal(getRecommendedLeadAction({ status: "Converted", telHref: phone }), "Lead converted");
  assert.equal(getPrimaryLeadAction({ status: "Converted", telHref: phone }).type, "none");
  assert.equal(canShowSmartWhatsApp({ status: "Converted", waHref: wa }), false);

  assert.equal(
    getRecommendedLeadAction({ status: "Not Interested", telHref: phone }),
    "No further action"
  );
  assert.equal(getPrimaryLeadAction({ status: "Not Interested", telHref: phone }).type, "none");
  assert.equal(canShowSmartWhatsApp({ status: "Not Interested", waHref: wa }), false);
});

test("Lost and Unknown fall back safely", () => {
  assert.equal(getRecommendedLeadAction({ status: "Lost", telHref: phone }), "Review lead");
  assert.equal(getPrimaryLeadAction({ status: "Lost", telHref: phone }).type, "review");
  assert.equal(getLeadProductivityStatus(""), "Unknown");
  assert.equal(getLeadProductivityStatus(null), "Unknown");
  assert.equal(getRecommendedLeadAction({ status: "", telHref: null }), "Review lead details");
  assert.equal(getPrimaryLeadAction({ status: "Unknown", telHref: null }).label, "Review Lead");
});

test("Missing phone or email does not invent communication CTAs", () => {
  assert.equal(hasUsablePhone(null), false);
  assert.equal(hasUsableEmail(""), false);
  assert.equal(
    getPrimaryLeadAction({ status: "New", telHref: null, mailtoHref: mail }).type,
    "email"
  );
  assert.equal(
    getPrimaryLeadAction({ status: "New", telHref: null, mailtoHref: null }).type,
    "review"
  );
  assert.equal(canShowSmartWhatsApp({ status: "Follow Up", waHref: null }), false);
  assert.equal(canShowSmartWhatsApp({ status: "Follow Up", waHref: wa }), true);
});

test("core utility does not mutate lead data", () => {
  const input = {
    status: "New",
    telHref: phone,
    mailtoHref: mail,
    waHref: wa,
    timelineEvents: [{ eventType: "STATUS_CHANGED" }]
  };
  const frozen = JSON.parse(JSON.stringify(input));
  buildLeadProductivitySummary(input);
  getRecommendedLeadAction(input);
  getPrimaryLeadAction(input);
  getLeadActivitySummary(input.timelineEvents);
  assert.deepEqual(input, frozen);
});

test("activity summary handles empty known and unknown timeline events", () => {
  assert.equal(getLeadActivitySummary([]), "No recent activity");
  assert.equal(getLeadActivitySummary(null), "No recent activity");
  assert.equal(
    getLeadActivitySummary([{ eventType: "STATUS_CHANGED" }]),
    "Last activity: Status Changed"
  );
  assert.equal(
    getLeadActivitySummary([{ eventType: "REMARK_ADDED" }]),
    "Last activity: Remark Added"
  );
  assert.equal(
    getLeadActivitySummary([{ eventType: "LEAD_GENERATED" }]),
    "Last activity: Lead Generated"
  );
  assert.equal(
    getLeadActivitySummary([{ eventType: "CUSTOM_THING" }]),
    "Last activity: Activity"
  );
});

test("quick status selects only and follow-up guidance", () => {
  assert.equal(quickStatusSelectsOnly(), true);
  assert.equal(contactActionsAutoChangeStatus(), false);
  assert.match(followUpActiveGuidance(), /Continue working this lead/);
  const options = getQuickLeadStatusOptions("Follow Up");
  assert.ok(options.includes("Contacted"));
  assert.ok(!options.includes("Follow Up"));
  assert.ok(!options.includes("Unknown"));
  assert.ok(!options.includes("New"));
});

test("Lead Detail wires productivity without notifications or backend changes", () => {
  const detail = fs.readFileSync(
    path.join(__dirname, "mobile/app/(app)/projects/[projectId]/lead/[rowNumber].tsx"),
    "utf8"
  );
  const smart = fs.readFileSync(
    path.join(__dirname, "mobile/components/LeadSmartNextAction.tsx"),
    "utf8"
  );
  const followUp = fs.readFileSync(
    path.join(__dirname, "mobile/components/LeadFollowUpSection.tsx"),
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

  assert.deepEqual(WORKFLOW_SECTIONS[0], "header");
  assert.deepEqual(WORKFLOW_SECTIONS[1], "workspace");
  assert.deepEqual(WORKFLOW_SECTIONS[2], "intelligence");
  assert.deepEqual(WORKFLOW_SECTIONS[3], "productivity");

  assert.match(detail, /LeadSmartNextAction/);
  assert.match(detail, /onSelectQuickStatus/);
  assert.match(detail, /setSelectedStatus/);
  assert.match(detail, /Save Status/);
  assert.match(detail, /LeadContactActions/);
  assert.match(detail, /LeadFollowUpSection/);
  assert.match(detail, /getLeadTimeline/);
  assert.doesNotMatch(detail, /expo-notifications|followUpAt|reminderAt|calendar/i);
  assert.doesNotMatch(detail, /CHATURX|ChaturX|Ankush CRM/);

  assert.match(smart, /Recommended Next Action/);
  assert.match(smart, /openCall|openEmail|openWhatsApp/);
  assert.match(smart, /Selects status only/);
  assert.doesNotMatch(smart, /updateLeadStatus/);

  assert.match(followUp, /followUpActiveGuidance/);
  assert.match(followUp, /No dates or reminders/);

  assert.doesNotMatch(api, /\/api\/productivity|\/api\/follow-ups|\/api\/reminders/);
  assert.doesNotMatch(server, /\/api\/productivity|\/api\/follow-ups|\/api\/reminders/);
  assert.doesNotMatch(db, /CREATE TABLE\s+(follow_ups|reminders|notifications|productivity)/i);
  assert.doesNotMatch(pkg, /expo-notifications|firebase|onesignal/);

  assert.match(list, /Bulk Status|selectionMode|runBulkLeadStatusUpdates/);
  assert.match(search, /Clear Filters/);
});
