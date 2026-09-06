"use strict";

const { classifyLeadStatus } = require("./dashboardSummaryCore");
const { timelineEventTitle } = require("./leadTimelineCore");

const QUICK_LEAD_STATUSES = Object.freeze([
  "Contacted",
  "Interested",
  "Follow Up",
  "Site Visit",
  "Converted",
  "Not Interested",
  "Lost"
]);

function getLeadProductivityStatus(rawStatus) {
  return classifyLeadStatus(rawStatus);
}

function hasUsablePhone(telHref) {
  return Boolean(telHref && String(telHref).trim());
}

function hasUsableEmail(mailtoHref) {
  return Boolean(mailtoHref && String(mailtoHref).trim());
}

function hasUsableContact({ telHref, mailtoHref } = {}) {
  return hasUsablePhone(telHref) || hasUsableEmail(mailtoHref);
}

function statusNeedsActiveOutreach(status) {
  return (
    status === "New" ||
    status === "Follow Up" ||
    status === "Interested" ||
    status === "Site Visit" ||
    status === "Contacted"
  );
}

function getLeadStageHint(rawStatus) {
  const status = getLeadProductivityStatus(rawStatus);
  switch (status) {
    case "New":
      return "New lead — contact and qualify this lead.";
    case "Contacted":
      return "Lead contacted — continue the conversation.";
    case "Interested":
      return "Lead is interested — move toward the next step.";
    case "Follow Up":
      return "Follow-up needed — continue working this lead.";
    case "Site Visit":
      return "Site visit stage — follow up on progress.";
    case "Converted":
      return "Lead converted.";
    case "Not Interested":
      return "No further action required.";
    case "Lost":
      return "Review the lead if needed.";
    default:
      return "Review lead details.";
  }
}

function getRecommendedLeadAction({ status, telHref, mailtoHref } = {}) {
  const normalized = getLeadProductivityStatus(status);
  const contactAvailable = hasUsableContact({ telHref, mailtoHref });

  if (statusNeedsActiveOutreach(normalized) && !contactAvailable) {
    return "Review lead details";
  }

  switch (normalized) {
    case "New":
      return "Contact this lead";
    case "Follow Up":
      return "Follow up with this lead";
    case "Interested":
      return "Continue the conversation";
    case "Site Visit":
      return "Follow up on the site visit";
    case "Contacted":
      return "Continue follow-up";
    case "Converted":
      return "Lead converted";
    case "Not Interested":
      return "No further action";
    case "Lost":
      return "Review lead";
    default:
      return "Review lead details";
  }
}

function getPrimaryLeadAction({ status, telHref, mailtoHref } = {}) {
  const normalized = getLeadProductivityStatus(status);

  if (normalized === "Converted") {
    return { type: "none", label: "Lead converted", href: null };
  }
  if (normalized === "Not Interested") {
    return { type: "none", label: "No further action", href: null };
  }

  if (statusNeedsActiveOutreach(normalized)) {
    if (hasUsablePhone(telHref)) {
      return { type: "call", label: "Call Lead", href: String(telHref).trim() };
    }
    if (hasUsableEmail(mailtoHref)) {
      return { type: "email", label: "Email Lead", href: String(mailtoHref).trim() };
    }
    return { type: "review", label: "Review Lead", href: null };
  }

  return { type: "review", label: "Review Lead", href: null };
}

function canShowSmartWhatsApp({ status, waHref } = {}) {
  const normalized = getLeadProductivityStatus(status);
  if (!statusNeedsActiveOutreach(normalized)) return false;
  return Boolean(waHref && String(waHref).trim());
}

function getLeadActivitySummary(events) {
  const list = Array.isArray(events) ? events : [];
  if (list.length === 0) return "No recent activity";
  const first = list[0];
  if (!first || typeof first !== "object") return "No recent activity";
  const title = timelineEventTitle(first.eventType);
  return `Last activity: ${title}`;
}

function getQuickLeadStatusOptions(currentStatus) {
  const current = String(currentStatus || "").trim();
  return QUICK_LEAD_STATUSES.filter(status => status !== current);
}

function quickStatusSelectsOnly() {
  // Quick chips only update local selection; Save Status remains required.
  return true;
}

function contactActionsAutoChangeStatus() {
  return false;
}

function followUpActiveGuidance() {
  return "Continue working this lead.";
}

function buildLeadProductivitySummary(input = {}) {
  const status = getLeadProductivityStatus(input.status);
  const recommendation = getRecommendedLeadAction(input);
  const primaryAction = getPrimaryLeadAction(input);
  const stageHint = getLeadStageHint(input.status);
  const activitySummary = getLeadActivitySummary(input.timelineEvents);
  const showWhatsApp = canShowSmartWhatsApp(input);
  const quickStatuses = getQuickLeadStatusOptions(status);

  return {
    status,
    recommendation,
    stageHint,
    primaryAction,
    showWhatsApp,
    activitySummary,
    quickStatuses,
    quickStatusSelectsOnly: quickStatusSelectsOnly()
  };
}

module.exports = {
  QUICK_LEAD_STATUSES,
  getLeadProductivityStatus,
  hasUsablePhone,
  hasUsableEmail,
  hasUsableContact,
  getLeadStageHint,
  getRecommendedLeadAction,
  getPrimaryLeadAction,
  canShowSmartWhatsApp,
  getLeadActivitySummary,
  getQuickLeadStatusOptions,
  quickStatusSelectsOnly,
  contactActionsAutoChangeStatus,
  followUpActiveGuidance,
  buildLeadProductivitySummary
};
