"use strict";

/** Exact statuses from the Website CRM backend (lead-status.js). */
const ALLOWED_LEAD_STATUSES = Object.freeze([
  "New",
  "Contacted",
  "Interested",
  "Follow Up",
  "Site Visit",
  "Converted",
  "Not Interested",
  "Lost"
]);

function isAllowedLeadStatus(value) {
  return ALLOWED_LEAD_STATUSES.includes(String(value || "").trim());
}

/**
 * Map displayed status (including Unknown) to picker selection.
 * Blank/unknown stays null — do not auto-select New.
 */
function initialStatusSelection(displayStatus) {
  const trimmed = String(displayStatus || "").trim();
  if (!trimmed || trimmed === "Unknown") return null;
  return isAllowedLeadStatus(trimmed) ? trimmed : null;
}

/**
 * Whether Save should call the API.
 * Same stored (allowed) status → no submit.
 * Unknown/blank → submit only when a valid status is selected.
 */
function shouldSubmitStatusChange(displayStatus, selectedStatus) {
  if (!isAllowedLeadStatus(selectedStatus)) return false;
  const current = initialStatusSelection(displayStatus);
  if (current === null) return true;
  return current !== selectedStatus;
}

function canEnableSaveStatus({ displayStatus, selectedStatus, saving }) {
  if (saving) return false;
  return shouldSubmitStatusChange(displayStatus, selectedStatus);
}

function applySuccessfulStatusUpdate(detail, nextStatus) {
  if (!detail || !isAllowedLeadStatus(nextStatus)) return detail;
  return {
    ...detail,
    status: nextStatus
  };
}

function mapStatusUpdateError(err) {
  if (!err) return { message: "Unable to update Lead Status.", clearAuth: false };
  if (err.name === "TypeError") {
    return { message: "Unable to update Lead Status.", clearAuth: false };
  }
  const status = Number(err.status);
  if (status === 401) {
    return { message: "Session expired. Please login again.", clearAuth: true };
  }
  if (status === 403) {
    return { message: "You don't have access to this project.", clearAuth: false };
  }
  if (status === 404) {
    return { message: "Lead not found.", clearAuth: false };
  }
  if (status === 400) {
    return { message: "Invalid Lead Status.", clearAuth: false };
  }
  return { message: "Unable to update Lead Status.", clearAuth: false };
}

module.exports = {
  ALLOWED_LEAD_STATUSES,
  isAllowedLeadStatus,
  initialStatusSelection,
  shouldSubmitStatusChange,
  canEnableSaveStatus,
  applySuccessfulStatusUpdate,
  mapStatusUpdateError
};
