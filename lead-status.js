"use strict";

const SUGGESTED_LEAD_STATUSES = [
  "New", "Contacted", "Interested", "Follow Up", "Site Visit", "Converted", "Not Interested", "Lost"
];

function normalizeLeadStatus(value) {
  return String(value ?? "").trim() || "New";
}

function validateLeadStatusUpdate(body) {
  const status = typeof body?.status === "string" ? body.status.trim() : "";
  if (!SUGGESTED_LEAD_STATUSES.includes(status)) {
    return { error: "Invalid Lead Status." };
  }
  return { value: status };
}

function validateLeadStatusRowNumber(value) {
  const rowNumber = Number(value);
  if (!Number.isSafeInteger(rowNumber) || rowNumber < 2) {
    return { error: "Invalid row number." };
  }
  return { value: rowNumber };
}

module.exports = {
  SUGGESTED_LEAD_STATUSES,
  normalizeLeadStatus,
  validateLeadStatusUpdate,
  validateLeadStatusRowNumber
};
