"use strict";

const WORKFLOW_SECTIONS = Object.freeze([
  "header",
  "intelligence",
  "productivity",
  "contact",
  "status",
  "followUp",
  "contactRemark",
  "remarks",
  "fields",
  "timeline"
]);

const NEXT_ACTIONS = Object.freeze([
  { id: "contact", label: "Contact" },
  { id: "status", label: "Update Status" },
  { id: "remarks", label: "Add Remark" },
  { id: "followUp", label: "Follow Up" }
]);

function displayLeadIdentityName(name) {
  const text = String(name ?? "").trim();
  return text || "Unnamed Lead";
}

function displayLeadIdentityPhone(phone) {
  const text = String(phone ?? "").trim();
  return text || "—";
}

function displayLeadIdentityEmail(email) {
  const text = String(email ?? "").trim();
  return text || "—";
}

function displayLeadIdentityStatus(status) {
  const text = String(status ?? "").trim();
  if (!text || text === "Unknown") return "Unknown";
  return text;
}

function shouldCollapseAdditionalFieldsByDefault(fieldCount) {
  const n = Number(fieldCount);
  return Number.isFinite(n) && n > 0;
}

function contactActionsChangeLeadStatus() {
  return false;
}

function contactRemarkChangesLeadStatus() {
  return false;
}

function stickyActionBarRecommended() {
  // Top Contact Actions already cover Call/WhatsApp/Email; sticky bars conflict
  // with keyboard + remark composers on small screens.
  return false;
}

function workflowUsesProjectIdAndRowNumber(source) {
  return (
    typeof source === "string" &&
    source.includes("projectId") &&
    source.includes("rowNumber") &&
    (source.includes("useLocalSearchParams") ||
      /\/projects\/\$\{.*projectId.*\}\/lead\/\$\{.*rowNumber.*\}/.test(source) ||
      source.includes("lead/[rowNumber]"))
  );
}

function timelineRemainsReadOnlyOnLeadDetail(source) {
  if (typeof source !== "string") return false;
  if (!source.includes("LeadTimelineSection")) return false;
  if (!source.includes("getLeadTimeline")) return false;
  if (/postLeadTimeline|createTimelineEvent|updateLeadTimeline|deleteLeadTimeline/i.test(source)) {
    return false;
  }
  if (/api\.(post|patch|delete)\w*\([^)]*timeline/i.test(source)) {
    return false;
  }
  return true;
}

module.exports = {
  WORKFLOW_SECTIONS,
  NEXT_ACTIONS,
  displayLeadIdentityName,
  displayLeadIdentityPhone,
  displayLeadIdentityEmail,
  displayLeadIdentityStatus,
  shouldCollapseAdditionalFieldsByDefault,
  contactActionsChangeLeadStatus,
  contactRemarkChangesLeadStatus,
  stickyActionBarRecommended,
  workflowUsesProjectIdAndRowNumber,
  timelineRemainsReadOnlyOnLeadDetail
};
