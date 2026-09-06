"use strict";

const {
  findNameColumn,
  findPhoneColumn,
  findEmailColumn,
  phonesMatchForSearch,
  normalizePhoneForLinks
} = require("./phoneHelpersCore");
const { classifyLeadStatus } = require("./dashboardSummaryCore");

function buildLeadListItems(projectData) {
  const columns = Array.isArray(projectData?.columns) ? projectData.columns : [];
  const leads = Array.isArray(projectData?.leads) ? projectData.leads : [];
  const rowNumbers = Array.isArray(projectData?.rowNumbers) ? projectData.rowNumbers : [];
  const statusColumn = projectData?.leadStatusColumn || null;
  const nameCol = findNameColumn(columns);
  const phoneCol = findPhoneColumn(columns);
  const emailCol = findEmailColumn(columns);

  const items = [];
  for (let i = 0; i < leads.length; i += 1) {
    const lead = leads[i];
    const rowNumber = Number(rowNumbers[i]);
    if (!lead || !Number.isSafeInteger(rowNumber) || rowNumber < 2) continue;

    const nameRaw = nameCol ? String(lead[nameCol] ?? "").trim() : "";
    const phoneRaw = phoneCol ? String(lead[phoneCol] ?? "").trim() : "";
    const emailRaw = emailCol ? String(lead[emailCol] ?? "").trim() : "";
    const statusRaw = statusColumn ? lead[statusColumn] : "";
    const status = classifyLeadStatus(statusRaw);
    const links = normalizePhoneForLinks(phoneRaw);

    items.push({
      rowNumber,
      leadId: String(rowNumber),
      name: nameRaw || "Unnamed Lead",
      phone: phoneRaw,
      email: emailRaw,
      status,
      telHref: links?.telHref || null,
      waHref: links?.waHref || null,
      lead,
      columns
    });
  }
  return items;
}

function leadMatchesQuery(item, query) {
  const q = String(query ?? "").trim();
  if (!q) return true;
  const lower = q.toLowerCase();

  if (item.name && String(item.name).toLowerCase().includes(lower)) return true;
  if (item.email && String(item.email).toLowerCase().includes(lower)) return true;
  if (item.phone && phonesMatchForSearch(q, item.phone)) return true;

  const lead = item.lead || {};
  for (const column of item.columns || []) {
    const value = String(lead[column] ?? "").toLowerCase();
    if (value && value.includes(lower)) return true;
  }
  return false;
}

function filterLeadListItems(items, { query = "", status = "" } = {}) {
  const list = Array.isArray(items) ? items : [];
  const statusFilter = String(status || "").trim();
  return list.filter(item => {
    if (statusFilter && statusFilter !== "All" && item.status !== statusFilter) {
      // Unknown filter matches Unknown classification only
      if (statusFilter === "Unknown") return item.status === "Unknown";
      return false;
    }
    return leadMatchesQuery(item, query);
  });
}

function areLeadListFiltersActive({ query = "", status = "All" } = {}) {
  return Boolean(String(query || "").trim()) || (String(status || "").trim() !== "All" && Boolean(status));
}

function formatLeadListCount({ filteredCount, totalCount, filtersActive }) {
  const filtered = Number(filteredCount);
  const total = Number(totalCount);
  if (!Number.isFinite(filtered) || filtered < 0) return "No matching leads";
  if (filtersActive) {
    if (filtered === 0) return "No matching leads";
    if (filtered === 1) return `1 of ${total} matching leads`;
    return `${filtered} of ${total} matching leads`;
  }
  if (!Number.isFinite(total) || total <= 0) return "No leads found";
  if (total === 1) return "1 lead";
  return `${total} leads`;
}

function displayLeadListName(name) {
  const text = String(name ?? "").trim();
  return text || "Unnamed Lead";
}

function displayLeadListPhone(phone) {
  const text = String(phone ?? "").trim();
  return text || "—";
}

function displayLeadListEmail(email) {
  const text = String(email ?? "").trim();
  return text || "—";
}

function displayLeadListStatus(status) {
  const text = String(status ?? "").trim();
  return text || "Unknown";
}

function leadListDetailHref(projectId, rowNumber) {
  const id = Number(projectId);
  const row = Number(rowNumber);
  if (!Number.isSafeInteger(id) || id <= 0) return null;
  if (!Number.isSafeInteger(row) || row < 2) return null;
  return `/projects/${id}/lead/${row}`;
}

function clearLeadListFilters(state = {}) {
  return {
    ...state,
    query: "",
    status: "All"
  };
}

/** Scroll is preserved by Expo Router Stack keeping the list screen mounted. */
function leadListScrollRestorationStrategy() {
  return "stack-native";
}

const BULK_STATUS_CONCURRENCY = 4;

function selectionKeyFromRowNumber(rowNumber) {
  const row = Number(rowNumber);
  if (!Number.isSafeInteger(row) || row < 2) return null;
  return String(row);
}

function toggleLeadSelection(selectedKeys, rowNumber) {
  const key = selectionKeyFromRowNumber(rowNumber);
  const next = new Set(Array.isArray(selectedKeys) ? selectedKeys : [...(selectedKeys || [])]);
  if (!key) return next;
  if (next.has(key)) next.delete(key);
  else next.add(key);
  return next;
}

function selectAllVisibleLeads(visibleItems) {
  const next = new Set();
  const list = Array.isArray(visibleItems) ? visibleItems : [];
  for (const item of list) {
    const key = selectionKeyFromRowNumber(item?.rowNumber);
    if (key) next.add(key);
  }
  return next;
}

function clearLeadSelection() {
  return new Set();
}

function selectedLeadCount(selectedKeys) {
  if (!selectedKeys) return 0;
  if (selectedKeys instanceof Set) return selectedKeys.size;
  if (Array.isArray(selectedKeys)) return selectedKeys.length;
  return 0;
}

function formatSelectionCount(count) {
  const n = Number(count);
  if (!Number.isFinite(n) || n <= 0) return "0 selected";
  if (n === 1) return "1 selected";
  return `${n} selected`;
}

function canEnableBulkStatus({ selectedCount, busy }) {
  if (busy) return false;
  return Number(selectedCount) > 0;
}

function bulkStatusConfirmationCopy(count, status) {
  const n = Number(count) || 0;
  const label = String(status || "").trim() || "status";
  return {
    title: "Confirm bulk status update",
    message: `Change ${n} selected lead${n === 1 ? "" : "s"} to "${label}"?`,
    cancel: "Cancel",
    confirm: "Confirm"
  };
}

function classifyBulkStatusOutcome(response, error) {
  if (error) return "failed";
  if (!response || typeof response !== "object") return "failed";
  if (response.unchanged === true) return "unchanged";
  if (response.ok === true || response.success === true || typeof response.status === "string") {
    return "updated";
  }
  return "failed";
}

function emptyBulkStatusSummary(total = 0) {
  return {
    total: Number(total) || 0,
    updated: 0,
    unchanged: 0,
    failed: 0,
    succeeded: 0
  };
}

function aggregateBulkStatusResults(outcomes) {
  const list = Array.isArray(outcomes) ? outcomes : [];
  const summary = emptyBulkStatusSummary(list.length);
  for (const outcome of list) {
    if (outcome === "updated") summary.updated += 1;
    else if (outcome === "unchanged") summary.unchanged += 1;
    else summary.failed += 1;
  }
  summary.succeeded = summary.updated + summary.unchanged;
  return summary;
}

function formatBulkStatusResult(summary) {
  const total = Number(summary?.total) || 0;
  const succeeded = Number(summary?.succeeded) || 0;
  const failed = Number(summary?.failed) || 0;
  const unchanged = Number(summary?.unchanged) || 0;
  const updated = Number(summary?.updated) || 0;

  if (total <= 0) return "No leads selected.";
  if (failed === 0 && unchanged === 0) {
    return `${updated} lead${updated === 1 ? "" : "s"} updated successfully.`;
  }
  if (failed === 0) {
    if (updated === 0) {
      return `${unchanged} lead${unchanged === 1 ? "" : "s"} already had this status.`;
    }
    return `${updated} updated, ${unchanged} already had this status.`;
  }
  if (succeeded === 0) {
    return `0 of ${total} leads updated.`;
  }
  return `${succeeded} of ${total} leads updated. ${failed} failed.`;
}

async function runBulkLeadStatusUpdates({
  projectId,
  rowNumbers,
  status,
  updateLeadStatus,
  concurrency = BULK_STATUS_CONCURRENCY,
  onProgress
}) {
  const { mapPool } = require("./dashboardSummaryCore");
  const rows = Array.isArray(rowNumbers)
    ? rowNumbers.map(Number).filter(row => Number.isSafeInteger(row) && row >= 2)
    : [];
  let completed = 0;
  const outcomes = await mapPool(rows, concurrency, async rowNumber => {
    try {
      const response = await updateLeadStatus(projectId, rowNumber, status);
      const outcome = classifyBulkStatusOutcome(response, null);
      completed += 1;
      if (typeof onProgress === "function") {
        onProgress({ completed, total: rows.length, rowNumber, outcome });
      }
      return outcome;
    } catch (_err) {
      completed += 1;
      if (typeof onProgress === "function") {
        onProgress({ completed, total: rows.length, rowNumber, outcome: "failed" });
      }
      return "failed";
    }
  });
  return aggregateBulkStatusResults(outcomes);
}

module.exports = {
  buildLeadListItems,
  leadMatchesQuery,
  filterLeadListItems,
  areLeadListFiltersActive,
  formatLeadListCount,
  displayLeadListName,
  displayLeadListPhone,
  displayLeadListEmail,
  displayLeadListStatus,
  leadListDetailHref,
  clearLeadListFilters,
  leadListScrollRestorationStrategy,
  BULK_STATUS_CONCURRENCY,
  selectionKeyFromRowNumber,
  toggleLeadSelection,
  selectAllVisibleLeads,
  clearLeadSelection,
  selectedLeadCount,
  formatSelectionCount,
  canEnableBulkStatus,
  bulkStatusConfirmationCopy,
  classifyBulkStatusOutcome,
  emptyBulkStatusSummary,
  aggregateBulkStatusResults,
  formatBulkStatusResult,
  runBulkLeadStatusUpdates
};
