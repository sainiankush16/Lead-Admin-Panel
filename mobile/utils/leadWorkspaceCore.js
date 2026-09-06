"use strict";

const { getLeadActivityIntelligence, getLeadRemarksIntelligence } = require("./leadIntelligenceCore");
const { getPipelineConversionContext } = require("./pipelineCore");
const {
  getPrimaryLeadAction,
  getRecommendedLeadAction,
  hasUsablePhone,
  hasUsableEmail
} = require("./leadProductivityCore");

function contactLabelFromHrefs({ telHref, mailtoHref } = {}) {
  if (hasUsablePhone(telHref)) return "Phone available";
  if (hasUsableEmail(mailtoHref)) return "Email available";
  return "Contact unavailable";
}

function buildWorkThisLeadSummary(input = {}) {
  const status = String(input.status ?? "").trim() || "Unknown";
  const pipeline = getPipelineConversionContext(status);
  const activity = getLeadActivityIntelligence(input.timelineEvents);
  const remarks = getLeadRemarksIntelligence(input.remarks);
  const contactLabel = contactLabelFromHrefs(input);
  const recommendation = getRecommendedLeadAction(input);
  const primaryAction = getPrimaryLeadAction(input);
  const projectName = String(input.projectName ?? "").trim() || "Not available";

  return {
    title: "Work This Lead",
    projectName,
    currentLabel: "Current",
    currentValue: pipeline.currentStage,
    nextLabel: "Next",
    nextValue: pipeline.nextStageLabel,
    contactLabel: "Contact",
    contactValue: contactLabel,
    activityLabel: "Activity",
    activityValue:
      !activity.available
        ? "Activity unavailable"
        : activity.count <= 0
          ? "No activity yet"
          : `${activity.count} event${activity.count === 1 ? "" : "s"}`,
    remarksLabel: "Remarks",
    remarksValue:
      !remarks.available
        ? "Remarks unavailable"
        : remarks.count <= 0
          ? "No remarks yet"
          : `${remarks.count} remark${remarks.count === 1 ? "" : "s"}`,
    recommendation,
    primaryAction,
    changesStatus: false,
    sendsCommunication: false,
    inventsScore: false
  };
}

module.exports = {
  contactLabelFromHrefs,
  buildWorkThisLeadSummary
};
