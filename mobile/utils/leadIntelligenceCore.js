"use strict";

const { classifyLeadStatus } = require("./dashboardSummaryCore");
const { timelineEventTitle } = require("./leadTimelineCore");
const { normalizePhoneForLinks } = require("./phoneHelpersCore");

const CONVERSION_PROGRESS_STAGES = Object.freeze([
  "New",
  "Contacted",
  "Interested",
  "Follow Up",
  "Site Visit",
  "Converted"
]);

const TERMINAL_STATUSES = Object.freeze(["Not Interested", "Lost"]);

function mailtoFromEmail(email) {
  const value = String(email ?? "").trim();
  if (!value || !value.includes("@")) return null;
  return `mailto:${value}`;
}

function getLeadIntelligenceStatus(rawStatus) {
  return classifyLeadStatus(rawStatus);
}

function hasUsableName(name) {
  const text = String(name ?? "").trim();
  if (!text) return false;
  if (text === "Unnamed Lead" || text === "—") return false;
  return true;
}

function hasUsablePhoneValue({ phone, telHref } = {}) {
  if (telHref && String(telHref).trim()) return true;
  const links = normalizePhoneForLinks(phone);
  return Boolean(links && links.telHref);
}

function hasUsableEmailValue({ email, mailtoHref } = {}) {
  if (mailtoHref && String(mailtoHref).trim()) return true;
  return Boolean(mailtoFromEmail(email));
}

function getLeadStageSummary(rawStatus) {
  const status = getLeadIntelligenceStatus(rawStatus);
  switch (status) {
    case "New":
      return "Lead has not been progressed yet.";
    case "Contacted":
      return "Initial contact has been made.";
    case "Interested":
      return "Lead has shown interest.";
    case "Follow Up":
      return "Lead requires continued follow-up.";
    case "Site Visit":
      return "Lead has reached the site-visit stage.";
    case "Converted":
      return "Lead has converted.";
    case "Not Interested":
      return "Lead is currently marked not interested.";
    case "Lost":
      return "Lead is marked lost.";
    default:
      return "Lead stage is unknown.";
  }
}

function getLeadConversionReadiness(rawStatus) {
  const status = getLeadIntelligenceStatus(rawStatus);
  switch (status) {
    case "New":
      return "Early Stage";
    case "Contacted":
    case "Interested":
      return "Engaged";
    case "Follow Up":
    case "Site Visit":
      return "Action Required";
    case "Converted":
      return "Converted";
    case "Not Interested":
      return "Closed / Not Interested";
    case "Lost":
      return "Closed / Lost";
    default:
      return "Unknown";
  }
}

function getLeadProgress(rawStatus) {
  const status = getLeadIntelligenceStatus(rawStatus);
  const description = getLeadStageSummary(status);

  if (status === "Unknown") {
    return {
      kind: "unknown",
      status,
      stages: CONVERSION_PROGRESS_STAGES.slice(),
      currentIndex: -1,
      terminalStatus: null,
      description,
      unavailableLabel: "Lead stage unavailable"
    };
  }

  if (TERMINAL_STATUSES.includes(status)) {
    return {
      kind: "terminal",
      status,
      stages: CONVERSION_PROGRESS_STAGES.slice(),
      currentIndex: -1,
      terminalStatus: status,
      description,
      unavailableLabel: null
    };
  }

  return {
    kind: "progress",
    status,
    stages: CONVERSION_PROGRESS_STAGES.slice(),
    currentIndex: CONVERSION_PROGRESS_STAGES.indexOf(status),
    terminalStatus: null,
    description,
    unavailableLabel: null
  };
}

function countActiveTimelineEvents(events) {
  const list = Array.isArray(events) ? events : [];
  let count = 0;
  for (const event of list) {
    if (!event || typeof event !== "object") continue;
    if (event.isDeleted) continue;
    count += 1;
  }
  return count;
}

function getLatestActivityLabel(events) {
  const list = Array.isArray(events) ? events : [];
  for (const event of list) {
    if (!event || typeof event !== "object") continue;
    if (event.isDeleted) continue;
    return timelineEventTitle(event.eventType);
  }
  return null;
}

function getLeadActivityIntelligence(events) {
  if (!Array.isArray(events)) {
    return {
      available: false,
      count: 0,
      latestLabel: null,
      summary: "Activity unavailable"
    };
  }
  const count = countActiveTimelineEvents(events);
  if (count <= 0) {
    return {
      available: true,
      count: 0,
      latestLabel: null,
      summary: "No activity yet"
    };
  }
  const latestLabel = getLatestActivityLabel(events);
  return {
    available: true,
    count,
    latestLabel,
    summary: latestLabel
      ? `${count} event${count === 1 ? "" : "s"} · Last: ${latestLabel}`
      : `${count} event${count === 1 ? "" : "s"}`
  };
}

function getLeadRemarksIntelligence(remarks) {
  if (!Array.isArray(remarks)) {
    return {
      available: false,
      count: 0,
      summary: "Remarks unavailable"
    };
  }
  const count = remarks.length;
  return {
    available: true,
    count,
    summary: count <= 0 ? "No remarks yet" : `${count} remark${count === 1 ? "" : "s"}`
  };
}

function getLeadQualificationSignals(input = {}) {
  const nameAvailable = hasUsableName(input.name);
  const phoneAvailable = hasUsablePhoneValue(input);
  const emailAvailable = hasUsableEmailValue(input);
  const activity = getLeadActivityIntelligence(input.timelineEvents);
  const remarks = getLeadRemarksIntelligence(input.remarks);

  return {
    nameAvailable,
    phoneAvailable,
    emailAvailable,
    activityAvailable: activity.available && activity.count > 0,
    remarksAvailable: remarks.available && remarks.count > 0,
    nameLabel: nameAvailable ? "Name available" : "Name missing",
    phoneLabel: phoneAvailable ? "Phone available" : "Phone missing",
    emailLabel: emailAvailable ? "Email available" : "Email missing",
    activityLabel:
      !activity.available
        ? "Activity unavailable"
        : activity.count > 0
          ? "Timeline available"
          : "No activity",
    remarksLabel:
      !remarks.available
        ? "Remarks unavailable"
        : remarks.count > 0
          ? "Remarks available"
          : "No remarks"
  };
}

function getLeadMissingInformation(input = {}) {
  const phoneAvailable = hasUsablePhoneValue(input);
  const emailAvailable = hasUsableEmailValue(input);
  const nameAvailable = hasUsableName(input.name);
  const items = [];

  if (!phoneAvailable) items.push("Phone number missing");
  if (!emailAvailable && !phoneAvailable) items.push("Email missing");
  if (!nameAvailable) items.push("Name missing");

  const contactComplete = phoneAvailable || emailAvailable;
  return {
    items,
    contactComplete,
    summary: contactComplete
      ? "Contact information complete"
      : items.filter(item => item.includes("Phone") || item.includes("Email")).join(". ") ||
        "Contact information incomplete"
  };
}

function inventsConversionScore() {
  return false;
}

function getLeadIntelligence(input = {}) {
  const status = getLeadIntelligenceStatus(input.status);
  const progress = getLeadProgress(status);
  const readiness = getLeadConversionReadiness(status);
  const stageSummary = getLeadStageSummary(status);
  const signals = getLeadQualificationSignals(input);
  const missing = getLeadMissingInformation(input);
  const activity = getLeadActivityIntelligence(input.timelineEvents);
  const remarks = getLeadRemarksIntelligence(input.remarks);
  const displayName = hasUsableName(input.name)
    ? String(input.name).trim()
    : "Not available";

  return {
    status,
    progress,
    readiness,
    stageSummary,
    signals,
    missing,
    activity,
    remarks,
    displayName,
    inventsConversionScore: inventsConversionScore()
  };
}

module.exports = {
  CONVERSION_PROGRESS_STAGES,
  TERMINAL_STATUSES,
  getLeadIntelligenceStatus,
  hasUsableName,
  hasUsablePhoneValue,
  hasUsableEmailValue,
  getLeadStageSummary,
  getLeadConversionReadiness,
  getLeadProgress,
  getLeadQualificationSignals,
  getLeadMissingInformation,
  getLeadActivityIntelligence,
  getLeadRemarksIntelligence,
  getLatestActivityLabel,
  countActiveTimelineEvents,
  inventsConversionScore,
  getLeadIntelligence
};
