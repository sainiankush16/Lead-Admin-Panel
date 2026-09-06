"use strict";

const { classifyLeadStatus, LEAD_STATUSES } = require("./dashboardSummaryCore");

/** Matches lead-search.js */
const MIN_QUERY_LENGTH = 2;
const MAX_QUERY_LENGTH = 120;
const ALL_PROJECTS = "all";
const ALL_STATUSES = "all";

function normalizeSearchQuery(value) {
  return typeof value === "string" ? value.trim() : "";
}

function validateSearchDraft(value) {
  const query = normalizeSearchQuery(value);
  if (!query || query.length < MIN_QUERY_LENGTH) {
    return { ok: false, error: "Enter at least 2 characters to search." };
  }
  if (query.length > MAX_QUERY_LENGTH) {
    return { ok: false, error: "Search query is too long." };
  }
  return { ok: true, value: query };
}

function canSubmitSearch({ query, searching }) {
  if (searching) return false;
  return validateSearchDraft(query).ok;
}

function formatSearchResultCount(count) {
  const n = Number(count);
  if (!Number.isFinite(n) || n <= 0) return "No matching leads";
  if (n === 1) return "1 lead found";
  return `${n} leads found`;
}

function displayLeadName(result) {
  const name = String(result?.name ?? "").trim();
  return name || "Unnamed Lead";
}

function displayFieldOrDash(value) {
  const text = String(value ?? "").trim();
  return text || "—";
}

function displayLeadStatus(status) {
  return classifyLeadStatus(status);
}

function displayProjectName(result) {
  const name = String(result?.projectName ?? "").trim();
  return name || "Project";
}

function leadDetailHref(result) {
  const projectId = Number(result?.projectId);
  const rowNumber = Number(result?.rowNumber);
  if (!Number.isSafeInteger(projectId) || projectId <= 0) return null;
  if (!Number.isSafeInteger(rowNumber) || rowNumber < 2) return null;
  return `/projects/${projectId}/lead/${rowNumber}`;
}

function mapSearchResults(payload) {
  const results = Array.isArray(payload?.results) ? payload.results : [];
  // Preserve server order.
  return results.map(item => ({
    projectId: Number(item.projectId),
    projectName: displayProjectName(item),
    rowNumber: Number(item.rowNumber),
    leadId: String(item.leadId || item.rowNumber || ""),
    name: displayLeadName(item),
    phone: displayFieldOrDash(item.phone),
    email: displayFieldOrDash(item.email),
    status: displayLeadStatus(item.status),
    matchedOn: Array.isArray(item.matchedOn) ? item.matchedOn : [],
    href: leadDetailHref(item)
  })).filter(item => item.href);
}

function hasPartialSheetErrors(payload) {
  return Array.isArray(payload?.sheetErrors) && payload.sheetErrors.length > 0;
}

function partialSheetErrorMessage() {
  return "Some projects could not be searched.";
}

function mapSearchError(err) {
  if (!err) return { message: "Unable to search leads.", clearAuth: false };
  if (err.name === "TypeError") {
    return {
      message: "Unable to search leads. Check your connection and try again.",
      clearAuth: false
    };
  }
  const status = Number(err.status);
  if (status === 401) {
    return { message: "Session expired. Please login again.", clearAuth: true };
  }
  if (status === 403) {
    return { message: "Unable to access search.", clearAuth: false };
  }
  if (status === 400) {
    const serverMessage = typeof err.message === "string" ? err.message.trim() : "";
    if (serverMessage && serverMessage !== "Request failed.") {
      return { message: serverMessage, clearAuth: false };
    }
    return { message: "Enter at least 2 characters to search.", clearAuth: false };
  }
  return { message: "Unable to search leads.", clearAuth: false };
}

function normalizeProjectFilter(value) {
  if (value == null || value === "" || value === ALL_PROJECTS || value === "All Projects") {
    return ALL_PROJECTS;
  }
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id <= 0) return ALL_PROJECTS;
  return id;
}

function normalizeStatusFilter(value) {
  const text = String(value ?? "").trim();
  if (!text || text === ALL_STATUSES || text === "All Statuses" || text === "All") {
    return ALL_STATUSES;
  }
  if (text === "Unknown") return "Unknown";
  if (LEAD_STATUSES.includes(text)) return text;
  return ALL_STATUSES;
}

function filterSearchResults(results, { projectFilter = ALL_PROJECTS, statusFilter = ALL_STATUSES } = {}) {
  const list = Array.isArray(results) ? results : [];
  const projectId = normalizeProjectFilter(projectFilter);
  const status = normalizeStatusFilter(statusFilter);
  return list.filter(item => {
    if (projectId !== ALL_PROJECTS && Number(item.projectId) !== Number(projectId)) {
      return false;
    }
    if (status !== ALL_STATUSES) {
      const itemStatus = classifyLeadStatus(item.status);
      if (itemStatus !== status) return false;
    }
    return true;
  });
}

function areSearchFiltersActive({ projectFilter, statusFilter } = {}) {
  return (
    normalizeProjectFilter(projectFilter) !== ALL_PROJECTS ||
    normalizeStatusFilter(statusFilter) !== ALL_STATUSES
  );
}

function applySearchFilters(state, patch = {}) {
  const next = {
    ...state,
    ...patch
  };
  next.projectFilter = normalizeProjectFilter(next.projectFilter);
  next.statusFilter = normalizeStatusFilter(next.statusFilter);
  const allResults = Array.isArray(next.allResults) ? next.allResults : [];
  const filtered = filterSearchResults(allResults, {
    projectFilter: next.projectFilter,
    statusFilter: next.statusFilter
  });
  return {
    ...next,
    results: filtered,
    count: filtered.length
  };
}

function clearSearchFilters(state) {
  return applySearchFilters(state, {
    projectFilter: ALL_PROJECTS,
    statusFilter: ALL_STATUSES
  });
}

function createInitialSearchState() {
  return {
    query: "",
    submittedQuery: null,
    allResults: [],
    results: [],
    count: 0,
    searching: false,
    error: null,
    partialErrors: false,
    hasSearched: false,
    projectFilter: ALL_PROJECTS,
    statusFilter: ALL_STATUSES
  };
}

function applySuccessfulSearch(state, payload, submittedQuery) {
  const mapped = mapSearchResults(payload);
  return applySearchFilters(
    {
      ...state,
      submittedQuery,
      allResults: mapped,
      searching: false,
      error: null,
      partialErrors: hasPartialSheetErrors(payload),
      hasSearched: true
    },
    {
      projectFilter: state?.projectFilter,
      statusFilter: state?.statusFilter
    }
  );
}

function clearSearchState() {
  return createInitialSearchState();
}

/** Global search API requires a non-empty query (min 2 chars). */
function globalSearchSupportsEmptyQuery() {
  return false;
}

module.exports = {
  MIN_QUERY_LENGTH,
  MAX_QUERY_LENGTH,
  ALL_PROJECTS,
  ALL_STATUSES,
  LEAD_STATUSES,
  normalizeSearchQuery,
  validateSearchDraft,
  canSubmitSearch,
  formatSearchResultCount,
  displayLeadName,
  displayFieldOrDash,
  displayLeadStatus,
  displayProjectName,
  leadDetailHref,
  mapSearchResults,
  hasPartialSheetErrors,
  partialSheetErrorMessage,
  mapSearchError,
  normalizeProjectFilter,
  normalizeStatusFilter,
  filterSearchResults,
  areSearchFiltersActive,
  applySearchFilters,
  clearSearchFilters,
  createInitialSearchState,
  applySuccessfulSearch,
  clearSearchState,
  globalSearchSupportsEmptyQuery
};
