"use strict";

const { normalizeLeadStatus } = require("./lead-status");

function normalizeHeader(value, index, used) {
  // Keep sheet headers exactly as entered for display.  Only blank headers need
  // a safe generated label so their values remain accessible in the UI.
  const base = String(value ?? "").trim() ? String(value) : `Column ${index + 1}`;
  let name = base;
  let count = 2;
  while (used.has(name.toLowerCase())) name = `${base} (${count++})`;
  used.add(name.toLowerCase());
  return name;
}

function sheetDataFromValues(values) {
  if (!Array.isArray(values) || values.length === 0) return { columns: [], leads: [], rowNumbers: [], rowCount: 0 };
  const width = Math.max(...values.map(row => Array.isArray(row) ? row.length : 0), 0);
  const used = new Set();
  const columns = Array.from({ length: width }, (_, index) => normalizeHeader(values[0]?.[index], index, used));
  const populatedRows = values.slice(1)
    .map((row, index) => ({ row, rowNumber: index + 2 }))
    .filter(({ row }) => Array.isArray(row) && row.some(value => String(value ?? "").trim() !== ""));
  const leads = populatedRows
    .map(({ row }) => Object.fromEntries(columns.map((column, index) => [column, String(row[index] ?? "")])));
  return { columns, leads, rowNumbers: populatedRows.map(({ rowNumber }) => rowNumber), rowCount: leads.length };
}

function findLeadStatusColumn(columns) {
  return (columns || []).find(column => String(column).trim().toLowerCase() === "lead status") || null;
}

function findLeadStatusColumnIndex(columns) {
  const index = (columns || []).findIndex(column => String(column).trim().toLowerCase() === "lead status");
  return index >= 0 ? index : null;
}

function leadStatusSummary(columns, leads) {
  const statusColumn = findLeadStatusColumn(columns);
  const totalLeads = Array.isArray(leads) ? leads.length : 0;
  if (!statusColumn) return { statusColumn: null, totalLeads, statuses: [] };

  const counts = new Map();
  for (const lead of leads) {
    const label = normalizeLeadStatus(lead?.[statusColumn]);
    counts.set(label, (counts.get(label) || 0) + 1);
  }
  const statuses = [...counts.entries()]
    .map(([name, count]) => ({ name, count, percentage: totalLeads ? (count / totalLeads) * 100 : 0 }))
    .sort((left, right) => right.count - left.count || left.name.localeCompare(right.name));
  return { statusColumn, totalLeads, statuses };
}

function filterLeads(columns, leads, search = "", status = "") {
  const needle = String(search).trim().toLowerCase();
  const statusColumn = findLeadStatusColumn(columns);
  return (leads || []).filter(lead => {
    if (status && normalizeLeadStatus(lead?.[statusColumn]) !== status) return false;
    return !needle || (columns || []).some(column => {
      const value = statusColumn && column === statusColumn
        ? normalizeLeadStatus(lead?.[column])
        : String(lead?.[column] ?? "");
      return value.toLowerCase().includes(needle);
    });
  });
}

module.exports = {
  sheetDataFromValues,
  findLeadStatusColumn,
  findLeadStatusColumnIndex,
  leadStatusSummary,
  filterLeads
};
