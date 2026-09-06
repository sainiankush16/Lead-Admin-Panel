"use strict";

/** Matches lead-search.js */
const MIN_QUERY_LENGTH = 2;
const MAX_QUERY_LENGTH = 120;

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
  if (!Number.isFinite(n) || n <= 0) return "No leads found.";
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
  if (status == null) return "Unknown";
  const text = String(status).trim();
  return text || "Unknown";
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

function createInitialSearchState() {
  return {
    query: "",
    submittedQuery: null,
    results: [],
    count: 0,
    searching: false,
    error: null,
    partialErrors: false,
    hasSearched: false
  };
}

function applySuccessfulSearch(state, payload, submittedQuery) {
  const mapped = mapSearchResults(payload);
  const count = Number.isFinite(Number(payload?.count)) ? Number(payload.count) : mapped.length;
  return {
    ...state,
    submittedQuery,
    results: mapped,
    count,
    searching: false,
    error: null,
    partialErrors: hasPartialSheetErrors(payload),
    hasSearched: true
  };
}

function clearSearchState() {
  return createInitialSearchState();
}

module.exports = {
  MIN_QUERY_LENGTH,
  MAX_QUERY_LENGTH,
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
  createInitialSearchState,
  applySuccessfulSearch,
  clearSearchState
};
