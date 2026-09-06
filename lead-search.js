"use strict";

const {
  findNameColumn,
  findPhoneColumn,
  findEmailColumn,
  phonesMatchForSearch
} = require("./public/phone-helpers");
const { findLeadStatusColumn } = require("./sheet-data");
const { normalizeLeadStatus } = require("./lead-status");

const MIN_QUERY_LENGTH = 2;
const MAX_QUERY_LENGTH = 120;

function validateSearchQuery(value) {
  const query = typeof value === "string" ? value.trim() : "";
  if (!query || query.length < MIN_QUERY_LENGTH) {
    return { error: "Enter at least 2 characters to search." };
  }
  if (query.length > MAX_QUERY_LENGTH) {
    return { error: "Search query is too long." };
  }
  return { value: query };
}

function textIncludes(haystack, needle) {
  return String(haystack ?? "").toLowerCase().includes(String(needle ?? "").toLowerCase());
}

function matchLeadFields({ lead, columns, query }) {
  const nameCol = findNameColumn(columns);
  const phoneCol = findPhoneColumn(columns);
  const emailCol = findEmailColumn(columns);
  const reasons = [];

  if (phoneCol && phonesMatchForSearch(query, lead[phoneCol])) {
    reasons.push("phone");
  }
  if (nameCol && textIncludes(lead[nameCol], query)) {
    reasons.push("name");
  }
  if (emailCol && textIncludes(lead[emailCol], query)) {
    reasons.push("email");
  }

  return reasons;
}

function sanitizeSearchHit({ project, lead, rowNumber, columns, matchedOn }) {
  const nameCol = findNameColumn(columns);
  const phoneCol = findPhoneColumn(columns);
  const emailCol = findEmailColumn(columns);
  const statusCol = findLeadStatusColumn(columns);
  return {
    projectId: Number(project.id),
    projectName: project.name,
    spreadsheetName: project.spreadsheet_name || "",
    sheetTitle: project.sheet_title || "",
    rowNumber: Number(rowNumber),
    leadId: String(rowNumber),
    name: nameCol ? String(lead[nameCol] ?? "").trim() : "",
    phone: phoneCol ? String(lead[phoneCol] ?? "").trim() : "",
    email: emailCol ? String(lead[emailCol] ?? "").trim() : "",
    status: statusCol ? normalizeLeadStatus(lead[statusCol]) : null,
    matchedOn
  };
}

function searchSheetData({ project, columns, leads, rowNumbers, query }) {
  const results = [];
  const list = Array.isArray(leads) ? leads : [];
  const rows = Array.isArray(rowNumbers) ? rowNumbers : [];
  for (let i = 0; i < list.length; i += 1) {
    const lead = list[i];
    const rowNumber = rows[i];
    if (!lead || !rowNumber) continue;
    const matchedOn = matchLeadFields({ lead, columns, query });
    if (!matchedOn.length) continue;
    results.push(sanitizeSearchHit({
      project,
      lead,
      rowNumber,
      columns,
      matchedOn
    }));
  }
  return results;
}

function sortSearchResults(results) {
  return [...results].sort((a, b) => {
    const byProject = String(a.projectName || "").localeCompare(String(b.projectName || ""), undefined, {
      sensitivity: "base"
    });
    if (byProject !== 0) return byProject;
    return Number(a.rowNumber) - Number(b.rowNumber);
  });
}

/**
 * Search only the caller-supplied authorized projects.
 * loadSheet(project) must return { columns, leads, rowNumbers }.
 */
async function searchAcrossAuthorizedProjects({ projects, query, loadSheet }) {
  const validated = validateSearchQuery(query);
  if (validated.error) {
    return { error: validated.error, statusCode: 400 };
  }

  const authorized = Array.isArray(projects) ? projects : [];
  const results = [];
  const sheetErrors = [];

  await Promise.all(authorized.map(async project => {
    try {
      const data = await loadSheet(project);
      const hits = searchSheetData({
        project,
        columns: data?.columns || [],
        leads: data?.leads || [],
        rowNumbers: data?.rowNumbers || [],
        query: validated.value
      });
      results.push(...hits);
    } catch (err) {
      sheetErrors.push({
        projectId: Number(project.id),
        projectName: project.name || "",
        message: err?.message || "Unable to read sheet."
      });
    }
  }));

  if (!authorized.length) {
    return {
      query: validated.value,
      count: 0,
      results: [],
      sheetErrors: []
    };
  }

  if (!results.length && sheetErrors.length === authorized.length) {
    return {
      error: "Unable to search Google Sheets right now. Please try again.",
      statusCode: 502,
      sheetErrors
    };
  }

  return {
    query: validated.value,
    count: results.length,
    results: sortSearchResults(results),
    sheetErrors
  };
}

function resultContainsForbiddenSecrets(payload) {
  const text = JSON.stringify(payload || {});
  const needles = [
    "refresh_token",
    "access_token",
    "client_secret",
    "password_hash",
    "TOKEN_ENCRYPTION",
    "spreadsheet_id",
    "spreadsheetId"
  ];
  return needles.some(needle => text.includes(needle));
}

module.exports = {
  MIN_QUERY_LENGTH,
  MAX_QUERY_LENGTH,
  validateSearchQuery,
  matchLeadFields,
  searchSheetData,
  sanitizeSearchHit,
  textIncludes,
  sortSearchResults,
  searchAcrossAuthorizedProjects,
  resultContainsForbiddenSecrets
};
