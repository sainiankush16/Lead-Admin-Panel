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

module.exports = {
  buildLeadListItems,
  leadMatchesQuery,
  filterLeadListItems
};
