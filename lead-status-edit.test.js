"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  ALLOWED_LEAD_STATUSES,
  isAllowedLeadStatus,
  initialStatusSelection,
  shouldSubmitStatusChange,
  canEnableSaveStatus,
  applySuccessfulStatusUpdate,
  mapStatusUpdateError
} = require("./mobile/utils/leadStatusEditCore");
const { buildLeadDetail, findLeadRawByRowNumber } = require("./mobile/utils/leadDetailCore");

test("status list contains exactly 8 configured statuses", () => {
  assert.equal(ALLOWED_LEAD_STATUSES.length, 8);
  assert.deepEqual([...ALLOWED_LEAD_STATUSES], [
    "New",
    "Contacted",
    "Interested",
    "Follow Up",
    "Site Visit",
    "Converted",
    "Not Interested",
    "Lost"
  ]);
});

test("current status selection and Unknown handling", () => {
  assert.equal(initialStatusSelection("Contacted"), "Contacted");
  assert.equal(initialStatusSelection("Unknown"), null);
  assert.equal(initialStatusSelection(""), null);
  assert.equal(initialStatusSelection("Hot"), null);
  assert.equal(isAllowedLeadStatus("Follow Up"), true);
  assert.equal(isAllowedLeadStatus("Pending"), false);
});

test("same status does not submit; save disabled while saving", () => {
  assert.equal(shouldSubmitStatusChange("Contacted", "Contacted"), false);
  assert.equal(shouldSubmitStatusChange("Contacted", "Interested"), true);
  assert.equal(shouldSubmitStatusChange("Unknown", "New"), true);
  assert.equal(shouldSubmitStatusChange("Unknown", null), false);
  assert.equal(
    canEnableSaveStatus({ displayStatus: "New", selectedStatus: "Lost", saving: true }),
    false
  );
  assert.equal(
    canEnableSaveStatus({ displayStatus: "New", selectedStatus: "Lost", saving: false }),
    true
  );
  assert.equal(
    canEnableSaveStatus({ displayStatus: "New", selectedStatus: "New", saving: false }),
    false
  );
});

test("successful response updates detail status; failure preserves previous", () => {
  const detail = {
    found: true,
    rowNumber: 5,
    name: "Satya",
    status: "Contacted",
    fields: []
  };
  const updated = applySuccessfulStatusUpdate(detail, "Interested");
  assert.equal(updated.status, "Interested");
  assert.equal(detail.status, "Contacted");
  assert.equal(applySuccessfulStatusUpdate(detail, "Nope"), detail);
});

test("status update error mapping covers auth and validation", () => {
  assert.equal(mapStatusUpdateError({ status: 401 }).message, "Session expired. Please login again.");
  assert.equal(mapStatusUpdateError({ status: 401 }).clearAuth, true);
  assert.equal(mapStatusUpdateError({ status: 403 }).message, "You don't have access to this project.");
  assert.equal(mapStatusUpdateError({ status: 404 }).message, "Lead not found.");
  assert.equal(mapStatusUpdateError({ status: 400 }).message, "Invalid Lead Status.");
  assert.equal(mapStatusUpdateError({ status: 500 }).message, "Unable to update Lead Status.");
  assert.equal(mapStatusUpdateError({ name: "TypeError" }).message, "Unable to update Lead Status.");
});

test("dynamic lead detail and row-number resolution remain correct", () => {
  const projectData = {
    name: "Advitya",
    columns: ["Full Name", "Mobile", "Email", "Lead Status", "Budget"],
    leads: [
      { "Full Name": "A", Mobile: "1", Email: "a@x.com", "Lead Status": "New", Budget: "10" },
      { "Full Name": "B", Mobile: "2", Email: "b@x.com", "Lead Status": "Lost", Budget: "20" }
    ],
    rowNumbers: [2, 9],
    leadStatusColumn: "Lead Status"
  };
  assert.equal(findLeadRawByRowNumber(projectData, 0), null);
  assert.equal(findLeadRawByRowNumber(projectData, 9)?.["Full Name"], "B");
  const detail = buildLeadDetail(projectData, 9);
  assert.equal(detail.found, true);
  assert.equal(detail.status, "Lost");
  assert.equal(detail.rowNumber, 9);
  assert.ok(detail.fields.some(f => f.header === "Budget"));
  assert.equal(shouldSubmitStatusChange(detail.status, "Lost"), false);
  assert.equal(shouldSubmitStatusChange(detail.status, "Converted"), true);
});
