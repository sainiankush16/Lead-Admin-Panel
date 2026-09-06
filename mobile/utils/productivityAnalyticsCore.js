"use strict";

const {
  LEAD_STATUSES,
  emptyStatusCounts,
  classifyLeadStatus,
  buildDashboardSummary
} = require("./dashboardSummaryCore");

/** Active workload stages (excludes Converted and terminal closures). */
const ACTIVE_ANALYTICS_STATUSES = Object.freeze([
  "New",
  "Contacted",
  "Interested",
  "Follow Up",
  "Site Visit"
]);

const CLOSED_ANALYTICS_STATUSES = Object.freeze([
  "Converted",
  "Not Interested",
  "Lost"
]);

/** Tie-break priority for top work stage (workflow priority). */
const TOP_WORK_STAGE_PRIORITY = Object.freeze([
  "Follow Up",
  "Interested",
  "Site Visit",
  "New",
  "Contacted"
]);

function emptyAnalyticsCounts() {
  return {
    statuses: emptyStatusCounts(),
    unknownStatusCount: 0,
    total: 0
  };
}

function normalizeAnalyticsCounts(input) {
  const statuses = emptyStatusCounts();
  let unknownStatusCount = 0;
  let total = 0;

  if (!input || typeof input !== "object") {
    return { statuses, unknownStatusCount, total };
  }

  if (input.statuses && typeof input.statuses === "object") {
    for (const key of LEAD_STATUSES) {
      const n = Number(input.statuses[key] || 0);
      statuses[key] = Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
      total += statuses[key];
    }
    unknownStatusCount = Number(input.unknownStatusCount || 0);
    if (!Number.isFinite(unknownStatusCount) || unknownStatusCount < 0) unknownStatusCount = 0;
    else unknownStatusCount = Math.floor(unknownStatusCount);
    total += unknownStatusCount;
    return { statuses, unknownStatusCount, total };
  }

  for (const key of LEAD_STATUSES) {
    if (Object.prototype.hasOwnProperty.call(input, key)) {
      const n = Number(input[key] || 0);
      statuses[key] = Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
      total += statuses[key];
    }
  }
  if (Object.prototype.hasOwnProperty.call(input, "Unknown")) {
    unknownStatusCount = Number(input.Unknown || 0);
    if (!Number.isFinite(unknownStatusCount) || unknownStatusCount < 0) unknownStatusCount = 0;
    else unknownStatusCount = Math.floor(unknownStatusCount);
    total += unknownStatusCount;
  } else if (Object.prototype.hasOwnProperty.call(input, "unknownStatusCount")) {
    unknownStatusCount = Number(input.unknownStatusCount || 0);
    if (!Number.isFinite(unknownStatusCount) || unknownStatusCount < 0) unknownStatusCount = 0;
    else unknownStatusCount = Math.floor(unknownStatusCount);
    total += unknownStatusCount;
  }
  return { statuses, unknownStatusCount, total };
}

function statusCount(normalized, status) {
  return Number(normalized.statuses[status] || 0);
}

function getActiveLeadCount(countsInput) {
  const counts = normalizeAnalyticsCounts(countsInput);
  let total = 0;
  for (const status of ACTIVE_ANALYTICS_STATUSES) {
    total += statusCount(counts, status);
  }
  return total;
}

function getClosedLeadCount(countsInput) {
  const counts = normalizeAnalyticsCounts(countsInput);
  let total = 0;
  for (const status of CLOSED_ANALYTICS_STATUSES) {
    total += statusCount(counts, status);
  }
  return total;
}

function getConvertedLeadCount(countsInput) {
  return statusCount(normalizeAnalyticsCounts(countsInput), "Converted");
}

function getFollowUpCount(countsInput) {
  return statusCount(normalizeAnalyticsCounts(countsInput), "Follow Up");
}

function getUnknownLeadCount(countsInput) {
  return normalizeAnalyticsCounts(countsInput).unknownStatusCount;
}

/**
 * Historical/current converted share.
 * Rate = Converted / (Converted + Not Interested + Lost + Active)
 * Unknown is excluded from the denominator.
 */
function getConversionRate(countsInput) {
  const counts = normalizeAnalyticsCounts(countsInput);
  const converted = statusCount(counts, "Converted");
  const active = getActiveLeadCount(counts);
  const notInterested = statusCount(counts, "Not Interested");
  const lost = statusCount(counts, "Lost");
  const denominator = converted + notInterested + lost + active;

  if (denominator <= 0) {
    return {
      available: false,
      numerator: converted,
      denominator: 0,
      rate: null,
      percent: null,
      label: "Conversion Rate: —",
      display: "—",
      isPrediction: false,
      isForecast: false,
      isProbability: false
    };
  }

  const rate = converted / denominator;
  const percent = Math.round(rate * 100);
  return {
    available: true,
    numerator: converted,
    denominator,
    rate,
    percent,
    label: `Conversion Rate: ${percent}%`,
    display: `${percent}%`,
    isPrediction: false,
    isForecast: false,
    isProbability: false
  };
}

function getTopWorkStage(countsInput) {
  const counts = normalizeAnalyticsCounts(countsInput);
  let bestStatus = null;
  let bestCount = 0;

  for (const status of TOP_WORK_STAGE_PRIORITY) {
    const n = statusCount(counts, status);
    if (n > bestCount) {
      bestCount = n;
      bestStatus = status;
    }
  }

  if (!bestStatus || bestCount <= 0) {
    return {
      status: null,
      count: 0,
      label: "No active workload stage",
      available: false
    };
  }

  return {
    status: bestStatus,
    count: bestCount,
    label: `${bestStatus} — ${bestCount} lead${bestCount === 1 ? "" : "s"}`,
    available: true
  };
}

function projectWorkloadFromSummaryProject(project) {
  const statusCounts = project?.statusCounts || emptyStatusCounts();
  const unknownStatusCount = Number(project?.unknownStatusCount || 0);
  const counts = normalizeAnalyticsCounts({
    statuses: statusCounts,
    unknownStatusCount
  });
  const active = getActiveLeadCount(counts);
  const followUp = getFollowUpCount(counts);
  const converted = getConvertedLeadCount(counts);
  const closed = getClosedLeadCount(counts);
  const totalLeads = Number(project?.leadCount);
  const resolvedTotal = Number.isFinite(totalLeads)
    ? Math.max(0, Math.floor(totalLeads))
    : counts.total;

  return {
    projectId: Number(project?.projectId),
    projectName: String(project?.projectName || "Untitled project").trim() || "Untitled project",
    totalLeads: resolvedTotal,
    active,
    followUp,
    converted,
    closed,
    unknown: counts.unknownStatusCount
  };
}

function getProjectWorkload(projectLeadsOrSummary) {
  if (!projectLeadsOrSummary) return [];

  // DashboardSummary-style { projects: [...] }
  if (
    !Array.isArray(projectLeadsOrSummary) &&
    typeof projectLeadsOrSummary === "object" &&
    Array.isArray(projectLeadsOrSummary.projects)
  ) {
    return projectLeadsOrSummary.projects.map(projectWorkloadFromSummaryProject);
  }

  const list = Array.isArray(projectLeadsOrSummary) ? projectLeadsOrSummary : [];
  if (!list.length) return [];

  // Already-built workload rows
  if (
    list[0] &&
    typeof list[0] === "object" &&
    Object.prototype.hasOwnProperty.call(list[0], "active") &&
    Object.prototype.hasOwnProperty.call(list[0], "followUp") &&
    Object.prototype.hasOwnProperty.call(list[0], "projectName")
  ) {
    return list.map(row => ({
      projectId: Number(row.projectId),
      projectName: String(row.projectName || "Untitled project"),
      totalLeads: Number(row.totalLeads) || 0,
      active: Number(row.active) || 0,
      followUp: Number(row.followUp) || 0,
      converted: Number(row.converted) || 0,
      closed: Number(row.closed) || 0,
      unknown: Number(row.unknown) || 0
    }));
  }

  const summary = buildDashboardSummary(list);
  return summary.projects.map(projectWorkloadFromSummaryProject);
}

function getTopProjectWorkload(projectLeadsOrWorkload) {
  const workloads = getProjectWorkload(projectLeadsOrWorkload);
  if (!workloads.length) {
    return {
      available: false,
      projectId: null,
      projectName: null,
      active: 0,
      label: "No project workload"
    };
  }

  let best = workloads[0];
  for (let i = 1; i < workloads.length; i += 1) {
    const row = workloads[i];
    if (row.active > best.active) {
      best = row;
    }
    // Equal active: keep earlier row (existing sorted project order).
  }

  if (best.active <= 0) {
    return {
      available: false,
      projectId: best.projectId,
      projectName: best.projectName,
      active: 0,
      label: "No active project workload"
    };
  }

  return {
    available: true,
    projectId: best.projectId,
    projectName: best.projectName,
    active: best.active,
    followUp: best.followUp,
    converted: best.converted,
    label: `${best.projectName} — ${best.active} active lead${best.active === 1 ? "" : "s"}`
  };
}

function resolveCountsFromInput(input) {
  if (!input) return emptyAnalyticsCounts();

  if (Array.isArray(input)) {
    const summary = buildDashboardSummary(input);
    return normalizeAnalyticsCounts({
      statuses: summary.statuses,
      unknownStatusCount: summary.unknownStatusCount
    });
  }

  if (typeof input === "object") {
    if (input.statuses && typeof input.statuses === "object") {
      return normalizeAnalyticsCounts(input);
    }
    if (Array.isArray(input.projects) && input.statuses) {
      return normalizeAnalyticsCounts({
        statuses: input.statuses,
        unknownStatusCount: input.unknownStatusCount
      });
    }
    return normalizeAnalyticsCounts(input);
  }

  return emptyAnalyticsCounts();
}

function getProductivityAnalytics(projectLeadsOrSummary) {
  const counts = resolveCountsFromInput(projectLeadsOrSummary);
  const active = getActiveLeadCount(counts);
  const closed = getClosedLeadCount(counts);
  const converted = getConvertedLeadCount(counts);
  const followUp = getFollowUpCount(counts);
  const unknown = getUnknownLeadCount(counts);
  const conversion = getConversionRate(counts);
  const topWorkStage = getTopWorkStage(counts);
  const projects = getProjectWorkload(projectLeadsOrSummary);
  const topProject = getTopProjectWorkload(projects);
  const empty = counts.total <= 0;

  return {
    empty,
    emptyLabel: "No productivity data yet",
    active,
    closed,
    converted,
    followUp,
    unknown,
    totalTracked: counts.total,
    conversion,
    topWorkStage,
    projects,
    topProject,
    inventsScore: false,
    inventsForecast: false,
    inventsProbability: false,
    isPrediction: false,
    label: "Productivity Overview"
  };
}

function inventsProductivityScore() {
  return false;
}

module.exports = {
  ACTIVE_ANALYTICS_STATUSES,
  CLOSED_ANALYTICS_STATUSES,
  TOP_WORK_STAGE_PRIORITY,
  emptyAnalyticsCounts,
  normalizeAnalyticsCounts,
  getActiveLeadCount,
  getClosedLeadCount,
  getConvertedLeadCount,
  getFollowUpCount,
  getUnknownLeadCount,
  getConversionRate,
  getTopWorkStage,
  getProjectWorkload,
  getTopProjectWorkload,
  getProductivityAnalytics,
  inventsProductivityScore,
  classifyLeadStatus
};
