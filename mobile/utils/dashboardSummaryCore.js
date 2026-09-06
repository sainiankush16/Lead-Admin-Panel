"use strict";

const LEAD_STATUSES = [
  "New",
  "Contacted",
  "Interested",
  "Follow Up",
  "Site Visit",
  "Converted",
  "Not Interested",
  "Lost"
];

/** Compact dashboard navigation statuses (exact Lead Status values). */
const ACTIONABLE_STATUSES = Object.freeze(["Follow Up", "New", "Interested", "Site Visit"]);

function emptyStatusCounts() {
  return {
    New: 0,
    Contacted: 0,
    Interested: 0,
    "Follow Up": 0,
    "Site Visit": 0,
    Converted: 0,
    "Not Interested": 0,
    Lost: 0
  };
}

function emptyActionableCounts() {
  return {
    "Follow Up": 0,
    New: 0,
    Interested: 0,
    "Site Visit": 0
  };
}

function isActionableStatus(value) {
  return ACTIONABLE_STATUSES.includes(String(value || "").trim());
}

function classifyLeadStatus(raw) {
  const value = String(raw ?? "").trim();
  if (!value) return "Unknown";
  if (LEAD_STATUSES.includes(value)) return value;
  return "Unknown";
}

function statusFromLead(lead, statusColumn) {
  if (!statusColumn) return "Unknown";
  return classifyLeadStatus(lead?.[statusColumn]);
}

function buildDashboardSummary(projectLeads) {
  const statuses = emptyStatusCounts();
  let totalLeads = 0;
  let unknownStatusCount = 0;
  const projects = [];
  const list = Array.isArray(projectLeads) ? projectLeads : [];

  for (const project of list) {
    const leads = Array.isArray(project.leads) ? project.leads : [];
    const leadCount = leads.length;
    totalLeads += leadCount;
    const projectStatusCounts = emptyStatusCounts();
    let projectUnknown = 0;

    const statusColumn = project.leadStatusColumn;
    for (const lead of leads) {
      const classified = statusFromLead(lead, statusColumn);
      if (classified === "Unknown") {
        unknownStatusCount += 1;
        projectUnknown += 1;
      } else {
        statuses[classified] += 1;
        projectStatusCounts[classified] += 1;
      }
    }

    projects.push({
      projectId: Number(project.id),
      projectName: project.name || "Untitled project",
      leadCount,
      lastSync: project.lastSync ?? null,
      statusCounts: projectStatusCounts,
      unknownStatusCount: projectUnknown
    });
  }

  projects.sort((a, b) =>
    String(a.projectName).localeCompare(String(b.projectName), undefined, { sensitivity: "base" })
  );

  const actionable = emptyActionableCounts();
  for (const key of ACTIONABLE_STATUSES) {
    actionable[key] = statuses[key] || 0;
  }

  return {
    totalLeads,
    statuses,
    actionable,
    unknownStatusCount,
    projects,
    hasProjects: projects.length > 0,
    hasLeads: totalLeads > 0
  };
}

/**
 * Choose a project lead-list target for an actionable dashboard status.
 * Prefers the authorized project with the highest matching status count.
 * Falls back to the first listed project when all counts are zero.
 */
function resolveActionableLeadTarget(summary, status) {
  const statusValue = String(status || "").trim();
  if (!isActionableStatus(statusValue)) return null;
  const projects = Array.isArray(summary?.projects) ? summary.projects : [];
  if (!projects.length) return null;

  let best = projects[0];
  let bestCount = Number(best.statusCounts?.[statusValue] || 0);
  for (let i = 1; i < projects.length; i += 1) {
    const count = Number(projects[i].statusCounts?.[statusValue] || 0);
    if (count > bestCount) {
      best = projects[i];
      bestCount = count;
    }
  }

  return {
    projectId: Number(best.projectId),
    projectName: best.projectName,
    status: statusValue,
    count: bestCount
  };
}

function normalizeLeadListStatusParam(raw) {
  const value = String(Array.isArray(raw) ? raw[0] : raw || "").trim();
  if (!value || value === "All") return null;
  if (value === "Unknown") return "Unknown";
  if (LEAD_STATUSES.includes(value)) return value;
  return null;
}

function buildLeadListPath(projectId, status) {
  const id = Number(projectId);
  if (!Number.isSafeInteger(id) || id <= 0) return null;
  const normalized = normalizeLeadListStatusParam(status);
  if (!normalized) return `/projects/${id}`;
  return `/projects/${id}?status=${encodeURIComponent(normalized)}`;
}

async function mapPool(items, concurrency, worker) {
  const list = Array.isArray(items) ? items : [];
  const limit = Math.max(1, Math.min(concurrency, list.length || 1));
  const results = new Array(list.length);
  let nextIndex = 0;

  async function runWorker() {
    while (nextIndex < list.length) {
      const current = nextIndex;
      nextIndex += 1;
      results[current] = await worker(list[current], current);
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, list.length) }, () => runWorker()));
  return results;
}

function greetingForDate(date = new Date()) {
  const hour = date.getHours();
  if (hour < 12) return "Good Morning";
  if (hour < 17) return "Good Afternoon";
  return "Good Evening";
}

module.exports = {
  LEAD_STATUSES,
  ACTIONABLE_STATUSES,
  emptyStatusCounts,
  emptyActionableCounts,
  isActionableStatus,
  classifyLeadStatus,
  statusFromLead,
  buildDashboardSummary,
  resolveActionableLeadTarget,
  normalizeLeadListStatusParam,
  buildLeadListPath,
  mapPool,
  greetingForDate
};
