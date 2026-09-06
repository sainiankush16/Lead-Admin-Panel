"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  MAX_REMARK_LENGTH,
  validateRemarkDraft,
  canMutateRemark,
  remarkAuthorLabel,
  leadIdFromRowNumber,
  mapRemarksLoadError,
  mapRemarkMutationError,
  canSubmitRemarkDraft
} = require("./mobile/utils/leadRemarksCore");
const {
  shouldSubmitStatusChange,
  canEnableSaveStatus
} = require("./mobile/utils/leadStatusEditCore");
const { buildLeadDetail } = require("./mobile/utils/leadDetailCore");

test("empty remark validation and max length match backend", () => {
  assert.equal(validateRemarkDraft("").ok, false);
  assert.equal(validateRemarkDraft("   ").ok, false);
  assert.equal(validateRemarkDraft("Hello").ok, true);
  assert.equal(validateRemarkDraft("Hello").value, "Hello");
  assert.equal(validateRemarkDraft("x".repeat(MAX_REMARK_LENGTH + 1)).ok, false);
  assert.equal(MAX_REMARK_LENGTH, 2000);
});

test("save remark disabled while busy and for empty draft", () => {
  assert.equal(canSubmitRemarkDraft({ draft: "ok", busy: false }), true);
  assert.equal(canSubmitRemarkDraft({ draft: "ok", busy: true }), false);
  assert.equal(canSubmitRemarkDraft({ draft: "  ", busy: false }), false);
});

test("edit/delete permission mirrors backend author-or-admin rule", () => {
  const remark = {
    id: 1,
    author: { userId: 9, name: "John", loginId: "john" }
  };
  assert.equal(canMutateRemark({ id: 9, role: "project_user" }, remark), true);
  assert.equal(canMutateRemark({ id: 2, role: "project_user" }, remark), false);
  assert.equal(canMutateRemark({ id: 1, role: "admin" }, remark), true);
  assert.equal(remarkAuthorLabel(remark), "John");
  assert.equal(remarkAuthorLabel({ author: { userId: 1, name: null, loginId: "anshul" } }), "anshul");
});

test("error mapping for remarks load and mutations", () => {
  assert.equal(mapRemarksLoadError({ status: 401 }).message, "Session expired. Please login again.");
  assert.equal(mapRemarksLoadError({ status: 403 }).message, "You don't have access to this project.");
  assert.equal(mapRemarksLoadError({ status: 404 }).message, "Lead not found.");
  assert.equal(mapRemarksLoadError({ name: "TypeError" }).message, "Unable to load remarks.");
  assert.equal(mapRemarkMutationError({ status: 400, message: "Remark text is required." }, "add").message, "Remark text is required.");
  assert.equal(mapRemarkMutationError({ status: 500 }, "add").message, "Unable to save remark.");
  assert.equal(mapRemarkMutationError({ status: 500 }, "delete").message, "Unable to delete remark.");
  assert.equal(mapRemarkMutationError({ name: "TypeError" }, "edit").message, "Unable to save remark.");
});

test("lead id uses row number and detail/status helpers still work", () => {
  assert.equal(leadIdFromRowNumber(12), "12");
  assert.equal(leadIdFromRowNumber(1), null);
  assert.equal(leadIdFromRowNumber(0), null);

  const projectData = {
    name: "Advitya",
    columns: ["Name", "Lead Status", "Budget"],
    leads: [{ Name: "Satya", "Lead Status": "Contacted", Budget: "50L" }],
    rowNumbers: [8],
    leadStatusColumn: "Lead Status"
  };
  const detail = buildLeadDetail(projectData, 8);
  assert.equal(detail.found, true);
  assert.equal(detail.status, "Contacted");
  assert.ok(detail.fields.some(f => f.header === "Budget"));
  assert.equal(shouldSubmitStatusChange("Contacted", "Interested"), true);
  assert.equal(canEnableSaveStatus({ displayStatus: "Contacted", selectedStatus: "Contacted", saving: false }), false);
});

test("remarks empty list and display helpers", () => {
  const remarks = [];
  assert.equal(remarks.length, 0);
  const loaded = [
    {
      id: 1,
      body: "Called the customer.",
      author: { userId: 1, name: "John", loginId: "john" },
      createdAt: "2026-01-01 10:00:00"
    }
  ];
  assert.equal(loaded.length, 1);
  assert.equal(remarkAuthorLabel(loaded[0]), "John");
});
