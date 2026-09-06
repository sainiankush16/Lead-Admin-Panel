"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const {
  ALL_PROJECTS,
  ALL_STATUSES,
  applySearchFilters,
  applySuccessfulSearch,
  areSearchFiltersActive,
  clearSearchFilters,
  createInitialSearchState,
  displayLeadStatus,
  filterSearchResults,
  formatSearchResultCount,
  globalSearchSupportsEmptyQuery,
  mapSearchResults
} = require("./mobile/utils/globalSearchCore");

function hit(partial) {
  return {
    projectId: 1,
    projectName: "Alpha",
    rowNumber: 2,
    leadId: "2",
    name: "Lead",
    phone: "9876543210",
    email: "a@x.com",
    status: "New",
    matchedOn: ["name"],
    href: "/projects/1/lead/2",
    ...partial
  };
}

test("project and status filters combine and clear correctly", () => {
  const all = [
    hit({ projectId: 1, projectName: "Alpha", rowNumber: 2, status: "Follow Up", name: "A" }),
    hit({ projectId: 1, projectName: "Alpha", rowNumber: 3, status: "New", name: "B", href: "/projects/1/lead/3" }),
    hit({ projectId: 2, projectName: "Beta", rowNumber: 4, status: "Follow Up", name: "C", href: "/projects/2/lead/4" }),
    hit({ projectId: 2, projectName: "Beta", rowNumber: 5, status: "Unknown", name: "D", href: "/projects/2/lead/5" })
  ];

  assert.equal(filterSearchResults(all, { projectFilter: 1 }).length, 2);
  assert.equal(filterSearchResults(all, { statusFilter: "Follow Up" }).length, 2);
  assert.equal(
    filterSearchResults(all, { projectFilter: 2, statusFilter: "Follow Up" }).length,
    1
  );
  assert.equal(filterSearchResults(all, { statusFilter: "Unknown" })[0].name, "D");
  assert.equal(filterSearchResults(all, { projectFilter: ALL_PROJECTS, statusFilter: ALL_STATUSES }).length, 4);

  let state = {
    ...createInitialSearchState(),
    query: "987654",
    submittedQuery: "987654",
    allResults: all,
    hasSearched: true
  };
  state = applySearchFilters(state, { projectFilter: 1, statusFilter: "Follow Up" });
  assert.equal(state.results.length, 1);
  assert.equal(state.count, 1);
  assert.equal(state.query, "987654");
  assert.equal(areSearchFiltersActive(state), true);

  const cleared = clearSearchFilters(state);
  assert.equal(cleared.projectFilter, ALL_PROJECTS);
  assert.equal(cleared.statusFilter, ALL_STATUSES);
  assert.equal(cleared.results.length, 4);
  assert.equal(cleared.query, "987654");
  assert.equal(formatSearchResultCount(cleared.count), "4 leads found");
});

test("blank and unrecognized statuses map to Unknown for filtering", () => {
  assert.equal(displayLeadStatus(null), "Unknown");
  assert.equal(displayLeadStatus(""), "Unknown");
  assert.equal(displayLeadStatus("Pending"), "Unknown");
  assert.equal(displayLeadStatus("Follow Up"), "Follow Up");

  const mapped = mapSearchResults({
    results: [
      {
        projectId: 3,
        projectName: "Gamma",
        rowNumber: 8,
        leadId: "8",
        name: "X",
        phone: "",
        email: "",
        status: "Pending",
        matchedOn: ["name"]
      }
    ]
  });
  assert.equal(mapped[0].status, "Unknown");
  assert.equal(filterSearchResults(mapped, { statusFilter: "Unknown" }).length, 1);
});

test("successful search preserves filters and uses filtered count", () => {
  const state = applySearchFilters(createInitialSearchState(), {
    projectFilter: 7,
    statusFilter: "Contacted"
  });
  const next = applySuccessfulSearch(
    { ...state, query: "Satya" },
    {
      count: 2,
      results: [
        {
          projectId: 7,
          projectName: "Advitya",
          rowNumber: 12,
          leadId: "12",
          name: "Satya",
          phone: "1",
          email: "a@x.com",
          status: "Contacted",
          matchedOn: ["name"]
        },
        {
          projectId: 8,
          projectName: "Other",
          rowNumber: 13,
          leadId: "13",
          name: "Satya Two",
          phone: "2",
          email: "b@x.com",
          status: "Contacted",
          matchedOn: ["name"]
        }
      ]
    },
    "Satya"
  );
  assert.equal(next.allResults.length, 2);
  assert.equal(next.results.length, 1);
  assert.equal(next.count, 1);
  assert.equal(next.projectFilter, 7);
  assert.equal(next.results[0].href, "/projects/7/lead/12");
});

test("empty global search is unsupported; Search UI wires filters without new APIs", () => {
  assert.equal(globalSearchSupportsEmptyQuery(), false);

  const screen = fs.readFileSync(path.join(__dirname, "mobile/app/(app)/search.tsx"), "utf8");
  assert.match(screen, /api\.searchLeads/);
  assert.match(screen, /api\.getProjects/);
  assert.match(screen, /applySearchFilters/);
  assert.match(screen, /clearSearchFilters/);
  assert.match(screen, /Clear Filters/);
  assert.match(screen, /All Projects/);
  assert.match(screen, /All Statuses/);
  assert.doesNotMatch(screen, /onChangeText[\s\S]*searchLeads/);
  assert.doesNotMatch(screen, /CHATURX|ChaturX|Ankush CRM/);

  const dashboard = fs.readFileSync(path.join(__dirname, "mobile/app/(app)/index.tsx"), "utf8");
  assert.match(dashboard, /resolveActionableLeadTarget/);
  assert.doesNotMatch(dashboard, /router\.push\(["'`]\/search/);

  const api = fs.readFileSync(path.join(__dirname, "mobile/services/api.ts"), "utf8");
  assert.doesNotMatch(api, /\/api\/leads\/search\/filter|\/api\/search\/advanced/);
  const server = fs.readFileSync(path.join(__dirname, "server.js"), "utf8");
  assert.doesNotMatch(server, /CREATE TABLE\s+global_search/i);
  const db = fs.readFileSync(path.join(__dirname, "db.js"), "utf8");
  assert.doesNotMatch(db, /CREATE TABLE\s+(global_search|search_index)/i);
});
