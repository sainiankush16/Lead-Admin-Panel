"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  SUGGESTED_LEAD_STATUSES,
  normalizeLeadStatus,
  validateLeadStatusUpdate,
  validateLeadStatusRowNumber
} = require("./lead-status");

test("blank Lead Status normalizes to New for display", () => {
  assert.equal(normalizeLeadStatus(""), "New");
  assert.equal(normalizeLeadStatus("   "), "New");
  assert.equal(normalizeLeadStatus(null), "New");
  assert.equal(normalizeLeadStatus("Contacted"), "Contacted");
});

test("valid status update validation accepts the configured statuses", () => {
  for (const status of SUGGESTED_LEAD_STATUSES) {
    assert.deepEqual(validateLeadStatusUpdate({ status }), { value: status });
  }
});

test("invalid status update validation is rejected", () => {
  assert.deepEqual(validateLeadStatusUpdate({ status: "Maybe" }), { error: "Invalid Lead Status." });
  assert.deepEqual(validateLeadStatusUpdate({}), { error: "Invalid Lead Status." });
  assert.deepEqual(validateLeadStatusUpdate({ status: " new " }), { error: "Invalid Lead Status." });
});

test("row number validation requires spreadsheet data rows", () => {
  assert.deepEqual(validateLeadStatusRowNumber(2), { value: 2 });
  assert.deepEqual(validateLeadStatusRowNumber("15"), { value: 15 });
  assert.deepEqual(validateLeadStatusRowNumber(1), { error: "Invalid row number." });
  assert.deepEqual(validateLeadStatusRowNumber(0), { error: "Invalid row number." });
  assert.deepEqual(validateLeadStatusRowNumber("row"), { error: "Invalid row number." });
});
