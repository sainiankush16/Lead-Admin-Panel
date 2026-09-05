"use strict";

const crypto = require("crypto");
const { findLeadStatusColumn } = require("./sheet-data");
const { normalizeLeadStatus } = require("./lead-status");

function parseSyncSnapshot(value) {
  if (value == null || value === "") return { rows: {} };
  try {
    const parsed = typeof value === "string" ? JSON.parse(value) : value;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return { rows: {} };
    const rows = parsed.rows && typeof parsed.rows === "object" && !Array.isArray(parsed.rows) ? parsed.rows : {};
    return { rows };
  } catch {
    return { rows: {} };
  }
}

function fingerprintLead(columns, lead, statusColumn) {
  // Exclude Lead Status so sync never treats status edits as lead-data changes
  // and never needs to rewrite status values during sync.
  const parts = (columns || [])
    .filter(column => column !== statusColumn)
    .map(column => String(lead?.[column] ?? ""));
  return crypto.createHash("sha256").update(JSON.stringify(parts), "utf8").digest("hex");
}

function buildSyncSnapshot(columns, leads, rowNumbers) {
  const statusColumn = findLeadStatusColumn(columns);
  const rows = {};
  const list = Array.isArray(leads) ? leads : [];
  const numbers = Array.isArray(rowNumbers) ? rowNumbers : [];
  for (let index = 0; index < numbers.length; index += 1) {
    rows[String(numbers[index])] = fingerprintLead(columns, list[index], statusColumn);
  }
  return { rows };
}

function compareSheetToSnapshot(previousSnapshot, columns, leads, rowNumbers) {
  const previous = parseSyncSnapshot(previousSnapshot);
  const statusColumn = findLeadStatusColumn(columns);
  const list = Array.isArray(leads) ? leads : [];
  const numbers = Array.isArray(rowNumbers) ? rowNumbers : [];
  const hasBaseline = Object.keys(previous.rows).length > 0;

  const newRowNumbers = [];
  const changedRowNumbers = [];
  const preservedStatuses = [];

  for (let index = 0; index < numbers.length; index += 1) {
    const rowNumber = numbers[index];
    const key = String(rowNumber);
    const lead = list[index] || {};
    const fingerprint = fingerprintLead(columns, lead, statusColumn);
    const rawStatus = statusColumn ? lead[statusColumn] : "";
    const displayStatus = normalizeLeadStatus(rawStatus);
    preservedStatuses.push({
      rowNumber,
      rawStatus: String(rawStatus ?? ""),
      displayStatus,
      unchangedNonEmpty: Boolean(String(rawStatus ?? "").trim())
    });

    if (!hasBaseline || !(key in previous.rows)) {
      if (hasBaseline) newRowNumbers.push(rowNumber);
      continue;
    }
    if (previous.rows[key] !== fingerprint) changedRowNumbers.push(rowNumber);
  }

  const snapshot = buildSyncSnapshot(columns, list, numbers);
  const newLeads = hasBaseline ? newRowNumbers.length : 0;
  const changedLeads = hasBaseline ? changedRowNumbers.length : 0;

  return {
    hasBaseline,
    newLeads,
    changedLeads,
    newRowNumbers,
    changedRowNumbers,
    totalLeads: numbers.length,
    snapshot,
    preservedStatuses,
    message: newLeads > 0
      ? `Sync completed — ${newLeads} new lead${newLeads === 1 ? "" : "s"} found.`
      : "Sync completed — no new leads found."
  };
}

function syncInProgressGuard() {
  const active = new Set();
  return {
    tryBegin(projectId) {
      if (active.has(projectId)) return false;
      active.add(projectId);
      return true;
    },
    end(projectId) {
      active.delete(projectId);
    },
    isActive(projectId) {
      return active.has(projectId);
    }
  };
}

module.exports = {
  parseSyncSnapshot,
  fingerprintLead,
  buildSyncSnapshot,
  compareSheetToSnapshot,
  syncInProgressGuard
};
