"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const {
  buildLeadListItems,
  filterLeadListItems,
  areLeadListFiltersActive,
  formatLeadListCount,
  displayLeadListName,
  displayLeadListPhone,
  displayLeadListEmail,
  displayLeadListStatus,
  leadListDetailHref,
  clearLeadListFilters,
  leadListScrollRestorationStrategy
} = require("./mobile/utils/leadListCore");

function sampleItems() {
  return buildLeadListItems({
    id: 9,
    name: "Alpha",
    columns: ["Full Name", "Phone", "Email", "Lead Status"],
    leadStatusColumn: "Lead Status",
    leads: [
      {
        "Full Name": "Rahul",
        Phone: "9876543210",
        Email: "rahul@x.com",
        "Lead Status": "Follow Up"
      },
      {
        "Full Name": "Rahul Two",
        Phone: "9999999999",
        Email: "r2@x.com",
        "Lead Status": "New"
      },
      {
        "Full Name": "",
        Phone: "",
        Email: "",
        "Lead Status": ""
      }
    ],
    rowNumbers: [2, 3, 4]
  });
}

test("search and status filters combine with correct filtered count", () => {
  const items = sampleItems();
  const filtered = filterLeadListItems(items, { query: "Rahul", status: "Follow Up" });
  assert.equal(filtered.length, 1);
  assert.equal(filtered[0].name, "Rahul");
  assert.equal(areLeadListFiltersActive({ query: "Rahul", status: "Follow Up" }), true);
  assert.equal(
    formatLeadListCount({ filteredCount: 1, totalCount: 3, filtersActive: true }),
    "1 of 3 matching leads"
  );
  assert.equal(
    formatLeadListCount({ filteredCount: 0, totalCount: 3, filtersActive: true }),
    "No matching leads"
  );
  assert.equal(
    formatLeadListCount({ filteredCount: 3, totalCount: 3, filtersActive: false }),
    "3 leads"
  );
});

test("clear filters and placeholders remain safe", () => {
  const cleared = clearLeadListFilters({ query: "Rahul", status: "Follow Up", projectId: 9 });
  assert.equal(cleared.query, "");
  assert.equal(cleared.status, "All");
  assert.equal(cleared.projectId, 9);
  assert.equal(displayLeadListName(""), "Unnamed Lead");
  assert.equal(displayLeadListPhone(""), "—");
  assert.equal(displayLeadListEmail(""), "—");
  assert.equal(displayLeadListStatus(""), "Unknown");
  assert.equal(displayLeadListStatus("Unknown"), "Unknown");
  assert.equal(leadListDetailHref(9, 2), "/projects/9/lead/2");
  assert.equal(leadListDetailHref(9, 1), null);
  assert.equal(leadListScrollRestorationStrategy(), "stack-native");

  const unknown = sampleItems().find(item => item.status === "Unknown");
  assert.ok(unknown);
  assert.equal(filterLeadListItems(sampleItems(), { status: "Unknown" }).length, 1);
});

test("Lead List preserves filters and refreshes on focus without new APIs", () => {
  const screen = fs.readFileSync(
    path.join(__dirname, "mobile/app/(app)/projects/[projectId]/index.tsx"),
    "utf8"
  );
  const card = fs.readFileSync(path.join(__dirname, "mobile/components/LeadCard.tsx"), "utf8");
  const api = fs.readFileSync(path.join(__dirname, "mobile/services/api.ts"), "utf8");
  const server = fs.readFileSync(path.join(__dirname, "server.js"), "utf8");
  const db = fs.readFileSync(path.join(__dirname, "db.js"), "utf8");
  const pkg = fs.readFileSync(path.join(__dirname, "mobile/package.json"), "utf8");

  assert.match(screen, /useFocusEffect/);
  assert.match(screen, /load\("focus"\)/);
  assert.match(screen, /filterLeadListItems/);
  assert.match(screen, /formatLeadListCount/);
  assert.match(
    screen,
    /pathname:\s*["']\/projects\/\[projectId\]\/lead\/\[rowNumber\]["']|leadListDetailHref/
  );
  assert.match(screen, /getProjectLeads/);
  assert.match(screen, /normalizeLeadListStatusParam/);
  assert.match(screen, /No matching leads/);
  assert.match(screen, /Clear Filters/);
  assert.doesNotMatch(screen, /onChangeText[\s\S]{0,80}getProjectLeads/);
  assert.doesNotMatch(screen, /CHATURX|ChaturX|Ankush CRM/);
  assert.doesNotMatch(screen, /redux|zustand|mobx|AsyncStorage/i);

  assert.match(card, /displayLeadListName/);
  assert.match(card, /displayLeadListPhone/);
  assert.match(card, /displayLeadListStatus/);
  assert.match(card, /openCall/);
  assert.match(card, /openWhatsApp/);
  assert.match(card, /ActionButton/);
  assert.doesNotMatch(card, /Tap for details/);

  assert.doesNotMatch(api, /\/api\/lead-list|\/api\/workflow/);
  assert.doesNotMatch(server, /app\.(get|post)\("\/api\/(lead-list|workflow)/);
  assert.doesNotMatch(db, /CREATE TABLE\s+(lead_cache|workflow_state|filter_state)/i);
  assert.doesNotMatch(pkg, /redux|zustand|mobx|@react-native-async-storage/i);

  const detail = fs.readFileSync(
    path.join(__dirname, "mobile/app/(app)/projects/[projectId]/lead/[rowNumber].tsx"),
    "utf8"
  );
  assert.match(detail, /LeadDetailHeader/);
  assert.match(detail, /LeadNextActions/);

  const search = fs.readFileSync(path.join(__dirname, "mobile/app/(app)/search.tsx"), "utf8");
  assert.match(search, /applySearchFilters|clearSearchFilters/);

  const dashboard = fs.readFileSync(path.join(__dirname, "mobile/app/(app)/index.tsx"), "utf8");
  assert.match(dashboard, /buildLeadListPath|resolveActionableLeadTarget/);
});
