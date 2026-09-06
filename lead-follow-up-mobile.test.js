"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const {
  FOLLOW_UP_STATUS,
  isFollowUpStatus,
  shouldMarkFollowUp,
  canEnableMarkFollowUp,
  followUpConfirmationCopy,
  alreadyFollowUpMessage,
  followUpSuccessMessage,
  validateFollowUpRemarkDraft,
  canSubmitFollowUpRemark,
  mapFollowUpStatusError,
  mapFollowUpRemarkError,
  followUpUsesExistingStatusApi,
  followUpRemarkUsesExistingRemarkApi,
  timelineRemainsReadOnly,
  hasNotificationInfrastructure
} = require("./mobile/utils/leadFollowUpCore");

test("Follow-Up action recognizes current status and same-status protection", () => {
  assert.equal(FOLLOW_UP_STATUS, "Follow Up");
  assert.equal(isFollowUpStatus("Follow Up"), true);
  assert.equal(isFollowUpStatus("Contacted"), false);
  assert.equal(shouldMarkFollowUp("Contacted"), true);
  assert.equal(shouldMarkFollowUp("Follow Up"), false);
  assert.equal(canEnableMarkFollowUp({ displayStatus: "New", saving: false }), true);
  assert.equal(canEnableMarkFollowUp({ displayStatus: "Follow Up", saving: false }), false);
  assert.equal(canEnableMarkFollowUp({ displayStatus: "New", saving: true }), false);
  assert.match(alreadyFollowUpMessage(), /already marked for follow-up/i);
  assert.match(followUpSuccessMessage(), /follow-up/i);
  const copy = followUpConfirmationCopy();
  assert.match(copy.title, /follow-up/i);
  assert.equal(copy.confirm, "Mark Follow Up");
});

test("Follow-Up remark validation and duplicate submit guard", () => {
  assert.equal(validateFollowUpRemarkDraft("").ok, false);
  assert.equal(validateFollowUpRemarkDraft("   ").ok, false);
  assert.equal(validateFollowUpRemarkDraft("Called customer.").ok, true);
  assert.equal(canSubmitFollowUpRemark({ draft: "Note", busy: false }), true);
  assert.equal(canSubmitFollowUpRemark({ draft: "Note", busy: true }), false);
  assert.equal(canSubmitFollowUpRemark({ draft: "  ", busy: false }), false);
});

test("Follow-Up error mapping covers auth network and permission", () => {
  assert.equal(
    mapFollowUpStatusError({ name: "TypeError" }).message,
    "Unable to update Lead Status."
  );
  assert.equal(mapFollowUpStatusError({ status: 401 }).clearAuth, true);
  assert.match(mapFollowUpStatusError({ status: 403 }).message, /access/i);
  assert.match(mapFollowUpRemarkError({ status: 400 }).message, /remark|required|invalid/i);
});

test("Lead Detail wires Follow-Up to existing status and remark APIs", () => {
  const detail = fs.readFileSync(
    path.join(__dirname, "mobile/app/(app)/projects/[projectId]/lead/[rowNumber].tsx"),
    "utf8"
  );
  const api = fs.readFileSync(path.join(__dirname, "mobile/services/api.ts"), "utf8");
  const component = fs.readFileSync(
    path.join(__dirname, "mobile/components/LeadFollowUpSection.tsx"),
    "utf8"
  );

  assert.match(detail, /LeadFollowUpSection/);
  assert.match(detail, /onMarkFollowUp/);
  assert.match(detail, /updateLeadStatus\(projectId, rowNumber, FOLLOW_UP_STATUS\)/);
  assert.match(detail, /onAddFollowUpRemark/);
  assert.match(detail, /api\.addRemark\(projectId, leadId/);
  assert.match(detail, /loadTimeline/);
  assert.doesNotMatch(detail, /postLeadTimeline|createTimelineEvent|POST.*timeline/i);
  assert.doesNotMatch(detail, /expo-notifications|Firebase|scheduleNotification|follow_ups/);
  assert.doesNotMatch(detail, /CHATURX|ChaturX|Ankush CRM/);

  assert.equal(followUpUsesExistingStatusApi(api), true);
  assert.equal(followUpRemarkUsesExistingRemarkApi(api), true);
  assert.equal(timelineRemainsReadOnly(api), true);

  assert.match(component, /followUpConfirmationCopy/);
  assert.match(component, /Add Follow-Up Remark/);
  assert.match(component, /followUpActiveGuidance|alreadyFollowUpMessage/);
  assert.equal(followUpConfirmationCopy().title, "Mark this lead for follow-up?");
});

test("No notification packages or follow-up database models added", () => {
  const pkg = fs.readFileSync(path.join(__dirname, "mobile/package.json"), "utf8");
  assert.equal(hasNotificationInfrastructure(pkg), false);

  const db = fs.readFileSync(path.join(__dirname, "db.js"), "utf8");
  assert.doesNotMatch(db, /CREATE TABLE\s+follow_ups/i);
  assert.doesNotMatch(db, /CREATE TABLE\s+reminders/i);
  assert.doesNotMatch(db, /CREATE TABLE\s+notifications/i);

  const server = fs.readFileSync(path.join(__dirname, "server.js"), "utf8");
  assert.doesNotMatch(server, /\/api\/follow-ups|\/api\/notifications|\/api\/reminders/);
});
