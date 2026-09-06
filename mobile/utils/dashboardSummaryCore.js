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

    projects.push({
      projectId: Number(project.id),
      projectName: project.name || "Untitled project",
      leadCount,
      lastSync: project.lastSync ?? null
    });

    const statusColumn = project.leadStatusColumn;
    for (const lead of leads) {
      const classified = statusFromLead(lead, statusColumn);
      if (classified === "Unknown") unknownStatusCount += 1;
      else statuses[classified] += 1;
    }
  }

  projects.sort((a, b) =>
    String(a.projectName).localeCompare(String(b.projectName), undefined, { sensitivity: "base" })
  );

  return {
    totalLeads,
    statuses,
    unknownStatusCount,
    projects,
    hasProjects: projects.length > 0,
    hasLeads: totalLeads > 0
  };
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
  emptyStatusCounts,
  classifyLeadStatus,
  statusFromLead,
  buildDashboardSummary,
  mapPool,
  greetingForDate
};
