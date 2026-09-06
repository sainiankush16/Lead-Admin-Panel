"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const {
  MIN_QUERY_LENGTH,
  validateSearchDraft,
  canSubmitSearch,
  formatSearchResultCount,
  displayLeadName,
  displayLeadStatus,
  displayProjectName,
  leadDetailHref,
  mapSearchResults,
  hasPartialSheetErrors,
  partialSheetErrorMessage,
  mapSearchError,
  createInitialSearchState,
  applySuccessfulSearch,
  clearSearchState
} = require("./mobile/utils/globalSearchCore");

test("initial search state and clear behavior", () => {
  const initial = createInitialSearchState();
  assert.equal(initial.hasSearched, false);
  assert.equal(initial.results.length, 0);
  assert.equal(initial.query, "");
  const cleared = clearSearchState();
  assert.deepEqual(cleared, createInitialSearchState());
});

test("query validation matches backend minimum", () => {
  assert.equal(MIN_QUERY_LENGTH, 2);
  assert.equal(validateSearchDraft("a").ok, false);
  assert.equal(validateSearchDraft("  ab  ").ok, true);
  assert.equal(validateSearchDraft("  ab  ").value, "ab");
  assert.equal(canSubmitSearch({ query: "ab", searching: false }), true);
  assert.equal(canSubmitSearch({ query: "ab", searching: true }), false);
});

test("result count formatting and empty handling", () => {
  assert.equal(formatSearchResultCount(0), "No leads found.");
  assert.equal(formatSearchResultCount(1), "1 lead found");
  assert.equal(formatSearchResultCount(12), "12 leads found");
});

test("result mapping preserves row numbers and project identity", () => {
  const mapped = mapSearchResults({
    count: 2,
    results: [
      {
        projectId: 7,
        projectName: "Advitya Techno Park",
        rowNumber: 12,
        leadId: "12",
        name: "Satya Thakur",
        phone: "9876543210",
        email: "satya@example.com",
        status: "Contacted",
        matchedOn: ["name"]
      },
      {
        projectId: 7,
        projectName: "Advitya Techno Park",
        rowNumber: 15,
        leadId: "15",
        name: "",
        phone: "",
        email: "",
        status: null,
        matchedOn: ["phone"]
      }
    ]
  });
  assert.equal(mapped.length, 2);
  assert.equal(mapped[0].name, "Satya Thakur");
  assert.equal(mapped[0].projectName, "Advitya Techno Park");
  assert.equal(mapped[0].rowNumber, 12);
  assert.equal(mapped[0].href, "/projects/7/lead/12");
  assert.equal(mapped[1].name, "Unnamed Lead");
  assert.equal(mapped[1].status, "Unknown");
  assert.equal(mapped[1].phone, "—");
  assert.equal(leadDetailHref({ projectId: 7, rowNumber: 1 }), null);
});

test("display helpers for blank and unknown fields", () => {
  assert.equal(displayLeadName({ name: "" }), "Unnamed Lead");
  assert.equal(displayProjectName({ projectName: "" }), "Project");
  assert.equal(displayLeadStatus(null), "Unknown");
  assert.equal(displayLeadStatus(""), "Unknown");
  assert.equal(displayLeadStatus("Follow Up"), "Follow Up");
});

test("partial sheet errors and search error mapping", () => {
  assert.equal(hasPartialSheetErrors({ sheetErrors: [{ projectId: 1 }] }), true);
  assert.equal(partialSheetErrorMessage(), "Some projects could not be searched.");
  assert.equal(mapSearchError({ status: 401 }).message, "Session expired. Please login again.");
  assert.equal(mapSearchError({ status: 403 }).message, "Unable to access search.");
  assert.equal(mapSearchError({ status: 400, message: "Enter at least 2 characters to search." }).message, "Enter at least 2 characters to search.");
  assert.equal(mapSearchError({ status: 500 }).message, "Unable to search leads.");
  assert.match(mapSearchError({ name: "TypeError" }).message, /connection/i);
});

test("successful search replaces previous results", () => {
  const first = applySuccessfulSearch(
    createInitialSearchState(),
    {
      count: 1,
      results: [{
        projectId: 1,
        projectName: "A",
        rowNumber: 2,
        leadId: "2",
        name: "One",
        phone: "1",
        email: "a@x.com",
        status: "New",
        matchedOn: ["name"]
      }]
    },
    "One"
  );
  assert.equal(first.results.length, 1);
  const second = applySuccessfulSearch(
    first,
    {
      count: 0,
      results: [],
      sheetErrors: [{ projectId: 2, projectName: "B", message: "fail" }]
    },
    "zzz"
  );
  assert.equal(second.results.length, 0);
  assert.equal(second.count, 0);
  assert.equal(second.submittedQuery, "zzz");
  assert.equal(second.partialErrors, true);
  assert.equal(second.hasSearched, true);
});

test("API client searchLeads uses existing global search endpoint", () => {
  const source = fs.readFileSync(path.join(__dirname, "mobile/services/api.ts"), "utf8");
  assert.match(source, /searchLeads\(query: string\)/);
  assert.match(source, /\/api\/leads\/search/);
  assert.match(source, /query:\s*\{\s*q:\s*query\s*\}/);
  const screen = fs.readFileSync(path.join(__dirname, "mobile/app/(app)/search.tsx"), "utf8");
  assert.match(screen, /api\.searchLeads/);
  assert.doesNotMatch(screen, /updateLeadStatus|addRemark|getLeadTimeline/);
  assert.match(screen, /\/projects\/\$\{.*projectId.*\}\/lead\/\$\{.*rowNumber.*\}|item\.href/);
});
