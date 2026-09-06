"use strict";

const {
  shouldSubmitStatusChange,
  isAllowedLeadStatus,
  mapStatusUpdateError
} = require("./leadStatusEditCore");
const {
  validateRemarkDraft,
  canSubmitRemarkDraft,
  mapRemarkMutationError
} = require("./leadRemarksCore");

const FOLLOW_UP_STATUS = "Follow Up";

function isFollowUpStatus(displayStatus) {
  return String(displayStatus || "").trim() === FOLLOW_UP_STATUS;
}

function shouldMarkFollowUp(displayStatus) {
  return shouldSubmitStatusChange(displayStatus, FOLLOW_UP_STATUS);
}

function followUpConfirmationCopy() {
  return {
    title: "Mark this lead for follow-up?",
    cancel: "Cancel",
    confirm: "Mark Follow Up"
  };
}

function alreadyFollowUpMessage() {
  return "This lead is already marked for follow-up.";
}

function followUpSuccessMessage() {
  return "Lead marked for follow-up.";
}

function followUpRemarkSuccessMessage() {
  return "Follow-up remark saved.";
}

function canEnableMarkFollowUp({ displayStatus, saving }) {
  if (saving) return false;
  return shouldMarkFollowUp(displayStatus);
}

function validateFollowUpRemarkDraft(value) {
  return validateRemarkDraft(value);
}

function canSubmitFollowUpRemark({ draft, busy }) {
  return canSubmitRemarkDraft({ draft, busy });
}

function mapFollowUpStatusError(err) {
  return mapStatusUpdateError(err);
}

function mapFollowUpRemarkError(err) {
  return mapRemarkMutationError(err, "add");
}

function followUpUsesExistingStatusApi(source) {
  return (
    typeof source === "string" &&
    source.includes("updateLeadStatus") &&
    /\/api\/projects\/\$\{projectId\}\/leads\/\$\{rowNumber\}\/status/.test(source)
  );
}

function followUpRemarkUsesExistingRemarkApi(source) {
  return (
    typeof source === "string" &&
    source.includes("addRemark") &&
    /\/api\/projects\/\$\{projectId\}\/leads\/\$\{.*leadId.*\}\/remarks/.test(source)
  );
}

function timelineRemainsReadOnly(source) {
  if (typeof source !== "string") return false;
  const hasGet = /getLeadTimeline|getTimeline/.test(source);
  const postsTimeline =
    /postLeadTimeline|createTimeline|POST.*timeline|post\(.*timeline/i.test(source);
  return hasGet && !postsTimeline;
}

function hasNotificationInfrastructure(packageJsonText) {
  if (typeof packageJsonText !== "string") return false;
  return /expo-notifications|firebase|@react-native-firebase|onesignal|apns|fcm|push-notification/i.test(
    packageJsonText
  );
}

module.exports = {
  FOLLOW_UP_STATUS,
  isFollowUpStatus,
  shouldMarkFollowUp,
  canEnableMarkFollowUp,
  followUpConfirmationCopy,
  alreadyFollowUpMessage,
  followUpSuccessMessage,
  followUpRemarkSuccessMessage,
  validateFollowUpRemarkDraft,
  canSubmitFollowUpRemark,
  mapFollowUpStatusError,
  mapFollowUpRemarkError,
  followUpUsesExistingStatusApi,
  followUpRemarkUsesExistingRemarkApi,
  timelineRemainsReadOnly,
  hasNotificationInfrastructure,
  isAllowedLeadStatus
};
