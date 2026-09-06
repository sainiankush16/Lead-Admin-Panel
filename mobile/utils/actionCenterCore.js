"use strict";

const { classifyLeadStatus } = require("./dashboardSummaryCore");
const { buildLeadListItems } = require("./leadListCore");

const ACTION_CENTER_STATUSES = Object.freeze([
  "Follow Up",
  "Interested",
  "Site Visit",
  "New",
  "Contacted"
]);

const ACTION_CENTER_PRIORITY = Object.freeze({
  "Follow Up": 1,
  Interested: 2,
  "Site Visit": 3,
  New: 4,
  Contacted: 5
});

const ACTION_CENTER_VISIBLE_LIMIT = 5;

function emptyActionCenterCounts() {
  return {
    "Follow Up": 0,
    Interested: 0,
    "Site Visit": 0,
    New: 0,
    Contacted: 0,
    total: 0
  };
}

function getActionPriority(rawStatus) {
  const status = classifyLeadStatus(rawStatus);
  const priority = ACTION_CENTER_PRIORITY[status];
  return Number.isFinite(priority) ? priority : null;
}

function isActionCenterStatus(rawStatus) {
  return getActionPriority(rawStatus) != null;
}

function getActionCenterLabel(rawStatus) {
  const status = classifyLeadStatus(rawStatus);
  if (!isActionCenterStatus(status)) return null;
  return status;
}

function contactAvailability(item) {
  const phoneAvailable = Boolean(item?.telHref && String(item.telHref).trim());
  const emailRaw = String(item?.email ?? "").trim();
  const emailAvailable = Boolean(emailRaw && emailRaw.includes("@"));
  return {
    phoneAvailable,
    emailAvailable,
    contactLabel: phoneAvailable
      ? "Phone available"
      : emailAvailable
        ? "Email available"
        : "Contact unavailable"
  };
}

function collectActionCenterItems(projectLeads) {
  const list = Array.isArray(projectLeads) ? projectLeads : [];
  const items = [];

  for (const project of list) {
    if (!project || typeof project !== "object") continue;
    const projectId = Number(project.id);
    if (!Number.isSafeInteger(projectId) || projectId <= 0) continue;
    const projectName = String(project.name || "Project").trim() || "Project";
    const leads = buildLeadListItems(project);

    for (const lead of leads) {
      if (!lead) continue;
      const priority = getActionPriority(lead.status);
      if (priority == null) continue;
      const availability = contactAvailability(lead);
      items.push({
        projectId,
        projectName,
        rowNumber: Number(lead.rowNumber),
        name: String(lead.name || "Unnamed Lead").trim() || "Unnamed Lead",
        phone: String(lead.phone || ""),
        email: String(lead.email || ""),
        status: classifyLeadStatus(lead.status),
        priority,
        phoneAvailable: availability.phoneAvailable,
        emailAvailable: availability.emailAvailable,
        contactLabel: availability.contactLabel,
        detailHref: `/projects/${projectId}/lead/${lead.rowNumber}`
      });
    }
  }

  items.sort((a, b) => {
    if (a.priority !== b.priority) return a.priority - b.priority;
    const byProject = String(a.projectName).localeCompare(String(b.projectName), undefined, {
      sensitivity: "base"
    });
    if (byProject !== 0) return byProject;
    return String(a.name).localeCompare(String(b.name), undefined, { sensitivity: "base" });
  });

  return items;
}

function getActionCenterCounts(items) {
  const counts = emptyActionCenterCounts();
  const list = Array.isArray(items) ? items : [];
  for (const item of list) {
    const status = classifyLeadStatus(item?.status);
    if (!Object.prototype.hasOwnProperty.call(counts, status)) continue;
    counts[status] += 1;
    counts.total += 1;
  }
  return counts;
}

function getActionCenterPriority(countsInput) {
  const counts = countsInput && typeof countsInput === "object" ? countsInput : emptyActionCenterCounts();
  for (const status of ACTION_CENTER_STATUSES) {
    const n = Number(counts[status] || 0);
    if (n > 0) {
      return {
        status,
        count: n,
        label: `Priority: ${status}`
      };
    }
  }
  return {
    status: null,
    count: 0,
    label: "No leads currently require action"
  };
}

function filterActionCenterItems(items, filter = "All") {
  const list = Array.isArray(items) ? items : [];
  const selected = String(filter || "All").trim() || "All";
  if (selected === "All") return list.slice();
  if (!ACTION_CENTER_STATUSES.includes(selected)) return [];
  return list.filter(item => item.status === selected);
}

function getActionCenterItems(items, options = {}) {
  const limitRaw = Number(options.limit);
  const limit = Number.isFinite(limitRaw) && limitRaw >= 0 ? Math.floor(limitRaw) : ACTION_CENTER_VISIBLE_LIMIT;
  const filtered = filterActionCenterItems(items, options.filter);
  const visibleItems = filtered.slice(0, limit);
  return {
    items: visibleItems,
    totalMatching: filtered.length,
    hasMore: filtered.length > visibleItems.length,
    limit
  };
}

function getActionCenterSummary(projectLeads, options = {}) {
  const allItems = collectActionCenterItems(projectLeads);
  const counts = getActionCenterCounts(allItems);
  const priority = getActionCenterPriority(counts);
  const filter = String(options.filter || "All").trim() || "All";
  const limited = getActionCenterItems(allItems, {
    filter,
    limit: options.limit ?? ACTION_CENTER_VISIBLE_LIMIT
  });
  // Work Next always uses overall priority (All), independent of list filter.
  const workNext = getWorkNextLead(projectLeads, { filter: "All" });

  return {
    counts,
    priority,
    filter,
    visibleItems: limited.items,
    totalMatching: limited.totalMatching,
    hasMore: limited.hasMore,
    limit: limited.limit,
    empty: counts.total <= 0,
    emptyLabel: "No leads currently require action",
    inventsScore: false,
    filterOptions: ["All", ...ACTION_CENTER_STATUSES],
    workNext
  };
}

/**
 * Deterministic next lead to work from Action Center data.
 * Uses existing priority ordering. Does not mutate leads or call APIs.
 */
function getWorkNextLead(projectLeadsOrItems, options = {}) {
  let items;
  const source = Array.isArray(projectLeadsOrItems) ? projectLeadsOrItems : [];
  if (
    source.length > 0 &&
    source[0] &&
    typeof source[0] === "object" &&
    Number.isFinite(Number(source[0].priority)) &&
    Number.isSafeInteger(Number(source[0].rowNumber))
  ) {
    items = source.slice();
  } else {
    items = collectActionCenterItems(source);
  }

  const filtered = filterActionCenterItems(items, options.filter || "All");
  if (!filtered.length) return null;

  const lead = filtered[0];
  return {
    projectId: Number(lead.projectId),
    projectName: String(lead.projectName || "Project"),
    rowNumber: Number(lead.rowNumber),
    name: String(lead.name || "Unnamed Lead"),
    phone: String(lead.phone || ""),
    email: String(lead.email || ""),
    status: lead.status,
    priority: Number(lead.priority),
    phoneAvailable: Boolean(lead.phoneAvailable),
    emailAvailable: Boolean(lead.emailAvailable),
    contactLabel: String(lead.contactLabel || "Contact unavailable"),
    detailHref: String(lead.detailHref || `/projects/${lead.projectId}/lead/${lead.rowNumber}`),
    changesStatus: false,
    sendsCommunication: false
  };
}

function inventsActionScore() {
  return false;
}

module.exports = {
  ACTION_CENTER_STATUSES,
  ACTION_CENTER_PRIORITY,
  ACTION_CENTER_VISIBLE_LIMIT,
  emptyActionCenterCounts,
  getActionPriority,
  isActionCenterStatus,
  getActionCenterLabel,
  collectActionCenterItems,
  getActionCenterCounts,
  getActionCenterPriority,
  filterActionCenterItems,
  getActionCenterItems,
  getActionCenterSummary,
  getWorkNextLead,
  inventsActionScore
};
