"use strict";

const {
  LEAD_STATUSES,
  emptyStatusCounts,
  classifyLeadStatus,
  buildLeadListPath
} = require("./dashboardSummaryCore");

const ACTIVE_PIPELINE_STAGES = Object.freeze([
  "New",
  "Contacted",
  "Interested",
  "Follow Up",
  "Site Visit",
  "Converted"
]);

const TERMINAL_PIPELINE_STAGES = Object.freeze(["Not Interested", "Lost"]);

const ATTENTION_PRIORITY = Object.freeze([
  "Follow Up",
  "Interested",
  "Site Visit",
  "New",
  "Contacted"
]);

const NEXT_PIPELINE_STAGE = Object.freeze({
  New: "Contacted",
  Contacted: "Interested",
  Interested: "Follow Up",
  "Follow Up": "Site Visit",
  "Site Visit": "Converted"
});

function emptyPipelineCounts() {
  return {
    statuses: emptyStatusCounts(),
    unknownStatusCount: 0,
    total: 0
  };
}

function getPipelineStageOrder() {
  return {
    active: ACTIVE_PIPELINE_STAGES.slice(),
    terminal: TERMINAL_PIPELINE_STAGES.slice(),
    attentionPriority: ATTENTION_PRIORITY.slice()
  };
}

function getPipelineStageCount(counts, status) {
  const key = String(status || "").trim();
  if (key === "Unknown") return Number(counts?.unknownStatusCount || 0);
  if (!LEAD_STATUSES.includes(key)) return 0;
  return Number(counts?.statuses?.[key] || counts?.[key] || 0);
}

function normalizeStatusCounts(input) {
  const statuses = emptyStatusCounts();
  let unknownStatusCount = 0;
  let total = 0;

  if (!input || typeof input !== "object") {
    return { statuses, unknownStatusCount, total };
  }

  // Dashboard-style { statuses, unknownStatusCount }
  if (input.statuses && typeof input.statuses === "object") {
    for (const key of LEAD_STATUSES) {
      const n = Number(input.statuses[key] || 0);
      statuses[key] = Number.isFinite(n) ? n : 0;
      total += statuses[key];
    }
    unknownStatusCount = Number(input.unknownStatusCount || 0);
    if (!Number.isFinite(unknownStatusCount) || unknownStatusCount < 0) unknownStatusCount = 0;
    total += unknownStatusCount;
    return { statuses, unknownStatusCount, total };
  }

  // Flat StatusCounts object
  for (const key of LEAD_STATUSES) {
    if (Object.prototype.hasOwnProperty.call(input, key)) {
      const n = Number(input[key] || 0);
      statuses[key] = Number.isFinite(n) ? n : 0;
      total += statuses[key];
    }
  }
  if (Object.prototype.hasOwnProperty.call(input, "Unknown")) {
    unknownStatusCount = Number(input.Unknown || 0);
    if (!Number.isFinite(unknownStatusCount) || unknownStatusCount < 0) unknownStatusCount = 0;
    total += unknownStatusCount;
  }
  return { statuses, unknownStatusCount, total };
}

function getPipelineCounts(leadsOrCounts, statusColumn) {
  if (Array.isArray(leadsOrCounts)) {
    const statuses = emptyStatusCounts();
    let unknownStatusCount = 0;
    let total = 0;
    for (const lead of leadsOrCounts) {
      total += 1;
      let classified;
      if (lead && typeof lead === "object" && Object.prototype.hasOwnProperty.call(lead, "status")) {
        classified = classifyLeadStatus(lead.status);
      } else {
        classified = statusColumn
          ? classifyLeadStatus(lead?.[statusColumn])
          : classifyLeadStatus(lead?.status);
      }
      if (classified === "Unknown") unknownStatusCount += 1;
      else statuses[classified] += 1;
    }
    return { statuses, unknownStatusCount, total };
  }

  return normalizeStatusCounts(leadsOrCounts);
}

function getNextPipelineStage(rawStatus) {
  const status = classifyLeadStatus(rawStatus);
  return NEXT_PIPELINE_STAGE[status] || null;
}

function getAttentionStage(countsInput) {
  const { statuses } = normalizeStatusCounts(countsInput);
  for (const status of ATTENTION_PRIORITY) {
    const count = Number(statuses[status] || 0);
    if (count > 0) {
      return {
        status,
        count,
        label: `${status} — ${count} lead${count === 1 ? "" : "s"}`
      };
    }
  }
  return {
    status: null,
    count: 0,
    label: "Pipeline has no active leads"
  };
}

function getPipelineHealth(countsInput) {
  if (countsInput == null) return "Pipeline data unavailable";
  const normalized = normalizeStatusCounts(countsInput);
  if (normalized.total <= 0) return "Pipeline has no active leads";

  const attention = getAttentionStage(normalized);
  if (attention.status === "Follow Up") {
    return `Follow Up has ${attention.count} lead${attention.count === 1 ? "" : "s"} needing attention`;
  }
  if (attention.status) {
    return `Most active leads are in ${attention.status}`;
  }
  const converted = Number(normalized.statuses.Converted || 0);
  if (converted > 0) {
    return `${converted} lead${converted === 1 ? "" : "s"} are converted`;
  }
  return "Pipeline has no active leads";
}

function getPipelineConversionContext(rawStatus) {
  const currentStage = classifyLeadStatus(rawStatus);
  const nextStage = getNextPipelineStage(currentStage);

  let nextStageLabel = "Next stage unavailable";
  if (currentStage === "Converted") nextStageLabel = "Pipeline complete";
  else if (currentStage === "Not Interested" || currentStage === "Lost") {
    nextStageLabel = "Pipeline closed";
  } else if (currentStage === "Unknown") nextStageLabel = "Next stage unavailable";
  else if (nextStage) nextStageLabel = nextStage;

  return {
    currentStage,
    nextStage,
    nextStageLabel,
    moveToLabel: nextStage ? `Move to ${nextStage}` : null,
    typicalNextLabel: nextStage ? "Typical next stage" : "Typical next stage"
  };
}

function getPipelineSummary(countsInput) {
  const normalized = normalizeStatusCounts(countsInput);
  const active = ACTIVE_PIPELINE_STAGES.map(status => ({
    status,
    count: normalized.statuses[status] || 0
  }));
  const terminal = TERMINAL_PIPELINE_STAGES.map(status => ({
    status,
    count: normalized.statuses[status] || 0
  }));
  const attention = getAttentionStage(normalized);
  const health = getPipelineHealth(normalized);

  return {
    ...normalized,
    active,
    terminal,
    unknownStatusCount: normalized.unknownStatusCount,
    attention,
    health,
    inventsScore: false
  };
}

function resolvePipelineLeadTarget(summary, status) {
  const statusValue = String(status || "").trim();
  if (!statusValue) return null;
  if (statusValue !== "Unknown" && !LEAD_STATUSES.includes(statusValue)) return null;

  const projects = Array.isArray(summary?.projects) ? summary.projects : [];
  if (!projects.length) return null;

  let best = projects[0];
  let bestCount =
    statusValue === "Unknown"
      ? Number(best.unknownStatusCount || 0)
      : Number(best.statusCounts?.[statusValue] || 0);

  for (let i = 1; i < projects.length; i += 1) {
    const count =
      statusValue === "Unknown"
        ? Number(projects[i].unknownStatusCount || 0)
        : Number(projects[i].statusCounts?.[statusValue] || 0);
    if (count > bestCount) {
      best = projects[i];
      bestCount = count;
    }
  }

  return {
    projectId: Number(best.projectId),
    projectName: best.projectName,
    status: statusValue,
    count: bestCount,
    path: buildLeadListPath(best.projectId, statusValue)
  };
}

function inventsPipelineScore() {
  return false;
}

module.exports = {
  ACTIVE_PIPELINE_STAGES,
  TERMINAL_PIPELINE_STAGES,
  ATTENTION_PRIORITY,
  NEXT_PIPELINE_STAGE,
  emptyPipelineCounts,
  getPipelineStageOrder,
  getPipelineStageCount,
  getPipelineCounts,
  getNextPipelineStage,
  getAttentionStage,
  getPipelineHealth,
  getPipelineConversionContext,
  getPipelineSummary,
  resolvePipelineLeadTarget,
  inventsPipelineScore,
  LEAD_STATUSES
};
