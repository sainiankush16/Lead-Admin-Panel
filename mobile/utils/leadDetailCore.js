"use strict";

const {
  findNameColumn,
  findPhoneColumn,
  findEmailColumn,
  normalizePhoneForLinks
} = require("./phoneHelpersCore");
const { classifyLeadStatus } = require("./dashboardSummaryCore");
const { buildLeadListItems } = require("./leadListCore");

function displayFieldValue(raw) {
  if (raw == null) return "—";
  const text = String(raw).trim();
  return text ? text : "—";
}

function buildMailtoHref(email) {
  const value = String(email ?? "").trim();
  if (!value || !value.includes("@")) return null;
  return `mailto:${value}`;
}

function findLeadIndexByRowNumber(projectData, rowNumber) {
  const target = Number(rowNumber);
  const rows = Array.isArray(projectData?.rowNumbers) ? projectData.rowNumbers : [];
  if (!Number.isSafeInteger(target) || target < 2) return -1;
  return rows.findIndex(row => Number(row) === target);
}

function findLeadRawByRowNumber(projectData, rowNumber) {
  const index = findLeadIndexByRowNumber(projectData, rowNumber);
  if (index < 0) return null;
  const leads = Array.isArray(projectData?.leads) ? projectData.leads : [];
  return leads[index] || null;
}

/**
 * Build a read-only lead detail model from project leads payload + row number.
 */
function buildLeadDetail(projectData, rowNumber) {
  if (!projectData) {
    return { found: false, error: "missing_project" };
  }

  const target = Number(rowNumber);
  if (!Number.isSafeInteger(target) || target < 2) {
    return { found: false, error: "invalid_row" };
  }

  const lead = findLeadRawByRowNumber(projectData, target);
  if (!lead) {
    return { found: false, error: "not_found" };
  }

  const columns = Array.isArray(projectData.columns) ? projectData.columns : [];
  const statusColumn = projectData.leadStatusColumn || null;
  const nameCol = findNameColumn(columns);
  const phoneCol = findPhoneColumn(columns);
  const emailCol = findEmailColumn(columns);

  const nameRaw = nameCol ? String(lead[nameCol] ?? "").trim() : "";
  const phoneRaw = phoneCol ? String(lead[phoneCol] ?? "").trim() : "";
  const emailRaw = emailCol ? String(lead[emailCol] ?? "").trim() : "";
  const status = classifyLeadStatus(statusColumn ? lead[statusColumn] : "");
  const links = normalizePhoneForLinks(phoneRaw);

  const promoted = new Set([nameCol, phoneCol, emailCol, statusColumn].filter(Boolean));
  const fields = [];
  for (const column of columns) {
    if (promoted.has(column)) continue;
    fields.push({
      header: column,
      value: displayFieldValue(lead[column])
    });
  }

  return {
    found: true,
    projectId: Number(projectData.id),
    projectName: projectData.name || "Project",
    rowNumber: target,
    leadId: String(target),
    name: nameRaw || "Unnamed Lead",
    phone: phoneRaw,
    email: emailRaw,
    status,
    telHref: links?.telHref || null,
    waHref: links?.waHref || null,
    mailtoHref: buildMailtoHref(emailRaw),
    fields,
    lead,
    columns
  };
}

function leadListItemToDetailSeed(item, projectId, projectName) {
  if (!item) return null;
  return {
    found: true,
    projectId: Number(projectId),
    projectName: projectName || "Project",
    rowNumber: Number(item.rowNumber),
    leadId: String(item.leadId || item.rowNumber),
    name: item.name || "Unnamed Lead",
    phone: item.phone || "",
    email: item.email || "",
    status: item.status || "Unknown",
    telHref: item.telHref || null,
    waHref: item.waHref || null,
    mailtoHref: buildMailtoHref(item.email),
    fields: (item.columns || [])
      .filter(column => {
        // Keep seed simple; full fields come from refresh.
        return true;
      })
      .map(column => ({
        header: column,
        value: displayFieldValue(item.lead?.[column])
      })),
    lead: item.lead,
    columns: item.columns || []
  };
}

module.exports = {
  displayFieldValue,
  buildMailtoHref,
  findLeadIndexByRowNumber,
  findLeadRawByRowNumber,
  buildLeadDetail,
  leadListItemToDetailSeed,
  buildLeadListItems
};
