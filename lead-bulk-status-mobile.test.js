"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const {
  buildLeadListItems,
  filterLeadListItems,
  selectionKeyFromRowNumber,
  toggleLeadSelection,
  selectAllVisibleLeads,
  clearLeadSelection,
  selectedLeadCount,
  formatSelectionCount,
  canEnableBulkStatus,
  bulkStatusConfirmationCopy,
  classifyBulkStatusOutcome,
  aggregateBulkStatusResults,
  formatBulkStatusResult,
  runBulkLeadStatusUpdates,
  BULK_STATUS_CONCURRENCY,
  leadListDetailHref
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
        "Full Name": "Anita",
        Phone: "9111111111",
        Email: "a@x.com",
        "Lead Status": "New"
      },
      {
        "Full Name": "",
        Phone: "",
        Email: "",
        "Lead Status": ""
      }
    ],
    rowNumbers: [2, 3, 4, 5]
  });
}

test("selection toggles by project rowNumber identity not index", () => {
  let selected = clearLeadSelection();
  assert.equal(selectedLeadCount(selected), 0);
  assert.equal(formatSelectionCount(0), "0 selected");

  selected = toggleLeadSelection(selected, 2);
  selected = toggleLeadSelection(selected, 4);
  assert.equal(selectedLeadCount(selected), 2);
  assert.equal(formatSelectionCount(2), "2 selected");
  assert.equal(selectionKeyFromRowNumber(2), "2");
  assert.equal(selectionKeyFromRowNumber(1), null);
  assert.ok(selected.has("2"));
  assert.ok(selected.has("4"));
  assert.equal(selected.has("0"), false);

  selected = toggleLeadSelection(selected, 2);
  assert.equal(selectedLeadCount(selected), 1);
  assert.ok(!selected.has("2"));
  assert.ok(selected.has("4"));
});

test("Select All only includes currently visible filtered leads", () => {
  const items = sampleItems();
  const filtered = filterLeadListItems(items, { query: "Rahul", status: "Follow Up" });
  assert.equal(filtered.length, 1);
  const selected = selectAllVisibleLeads(filtered);
  assert.equal(selectedLeadCount(selected), 1);
  assert.ok(selected.has("2"));
  assert.ok(!selected.has("3"));
  assert.ok(!selected.has("4"));

  const allNew = selectAllVisibleLeads(filterLeadListItems(items, { status: "New" }));
  assert.equal(selectedLeadCount(allNew), 2);
  assert.ok(allNew.has("3"));
  assert.ok(allNew.has("4"));
  assert.ok(!allNew.has("2"));
});

test("Clear Selection and bulk enablement", () => {
  let selected = selectAllVisibleLeads(sampleItems());
  assert.ok(selectedLeadCount(selected) > 0);
  selected = clearLeadSelection();
  assert.equal(selectedLeadCount(selected), 0);
  assert.equal(canEnableBulkStatus({ selectedCount: 0, busy: false }), false);
  assert.equal(canEnableBulkStatus({ selectedCount: 3, busy: false }), true);
  assert.equal(canEnableBulkStatus({ selectedCount: 3, busy: true }), false);

  const copy = bulkStatusConfirmationCopy(5, "Follow Up");
  assert.match(copy.message, /5 selected leads/);
  assert.match(copy.message, /Follow Up/);
  assert.equal(copy.confirm, "Confirm");
  assert.equal(copy.cancel, "Cancel");
});

test("bulk outcome classification and result formatting", () => {
  assert.equal(classifyBulkStatusOutcome({ unchanged: true }, null), "unchanged");
  assert.equal(classifyBulkStatusOutcome({ ok: true, status: "New" }, null), "updated");
  assert.equal(classifyBulkStatusOutcome({ status: "Contacted" }, null), "updated");
  assert.equal(classifyBulkStatusOutcome({}, new Error("x")), "failed");
  assert.equal(classifyBulkStatusOutcome(null, null), "failed");

  const partial = aggregateBulkStatusResults([
    "updated",
    "updated",
    "unchanged",
    "failed",
    "failed"
  ]);
  assert.equal(partial.total, 5);
  assert.equal(partial.updated, 2);
  assert.equal(partial.unchanged, 1);
  assert.equal(partial.failed, 2);
  assert.equal(partial.succeeded, 3);
  assert.equal(formatBulkStatusResult(partial), "3 of 5 leads updated. 2 failed.");

  const full = aggregateBulkStatusResults(["updated", "updated"]);
  assert.equal(formatBulkStatusResult(full), "2 leads updated successfully.");

  const already = aggregateBulkStatusResults(["unchanged", "unchanged"]);
  assert.equal(formatBulkStatusResult(already), "2 leads already had this status.");

  const none = aggregateBulkStatusResults(["failed", "failed"]);
  assert.equal(formatBulkStatusResult(none), "0 of 2 leads updated.");
});

test("runBulkLeadStatusUpdates reuses single-lead updates with bounded concurrency", async () => {
  let concurrent = 0;
  let maxConcurrent = 0;
  const calls = [];
  const updateLeadStatus = async (projectId, rowNumber, status) => {
    concurrent += 1;
    maxConcurrent = Math.max(maxConcurrent, concurrent);
    calls.push({ projectId, rowNumber, status });
    await new Promise(resolve => setTimeout(resolve, 25));
    concurrent -= 1;
    if (rowNumber === 3) {
      const err = new Error("forbidden");
      err.status = 403;
      throw err;
    }
    if (rowNumber === 4) return { unchanged: true, status: "Follow Up" };
    if (rowNumber === 5) {
      const err = new Error("missing");
      err.status = 404;
      throw err;
    }
    return { ok: true, status };
  };

  const summary = await runBulkLeadStatusUpdates({
    projectId: 9,
    rowNumbers: [2, 3, 4, 5, 6],
    status: "Follow Up",
    concurrency: BULK_STATUS_CONCURRENCY,
    updateLeadStatus
  });

  assert.equal(BULK_STATUS_CONCURRENCY, 4);
  assert.ok(maxConcurrent <= 4);
  assert.equal(calls.length, 5);
  assert.deepEqual(
    calls.map(c => c.rowNumber).sort((a, b) => a - b),
    [2, 3, 4, 5, 6]
  );
  assert.ok(calls.every(c => c.projectId === 9 && c.status === "Follow Up"));
  assert.equal(summary.total, 5);
  assert.equal(summary.updated, 2);
  assert.equal(summary.unchanged, 1);
  assert.equal(summary.failed, 2);
  assert.equal(summary.succeeded, 3);
  assert.match(formatBulkStatusResult(summary), /3 of 5/);
});

test("failed bulk updates are not retried automatically", async () => {
  let calls = 0;
  const summary = await runBulkLeadStatusUpdates({
    projectId: 1,
    rowNumbers: [2, 3],
    status: "Contacted",
    concurrency: 4,
    updateLeadStatus: async () => {
      calls += 1;
      throw new TypeError("network");
    }
  });
  assert.equal(calls, 2);
  assert.equal(summary.failed, 2);
  assert.equal(summary.succeeded, 0);
  assert.equal(formatBulkStatusResult(summary), "0 of 2 leads updated.");
});

test("Lead List bulk selection UX reuses existing status API without bulk endpoints", () => {
  const screen = fs.readFileSync(
    path.join(__dirname, "mobile/app/(app)/projects/[projectId]/index.tsx"),
    "utf8"
  );
  const card = fs.readFileSync(path.join(__dirname, "mobile/components/LeadCard.tsx"), "utf8");
  const api = fs.readFileSync(path.join(__dirname, "mobile/services/api.ts"), "utf8");
  const server = fs.readFileSync(path.join(__dirname, "server.js"), "utf8");
  const db = fs.readFileSync(path.join(__dirname, "db.js"), "utf8");
  const pkg = fs.readFileSync(path.join(__dirname, "mobile/package.json"), "utf8");
  const leadDetail = fs.readFileSync(
    path.join(__dirname, "mobile/app/(app)/projects/[projectId]/lead/[rowNumber].tsx"),
    "utf8"
  );
  const dashboard = fs.readFileSync(path.join(__dirname, "mobile/app/(app)/index.tsx"), "utf8");
  const search = fs.readFileSync(path.join(__dirname, "mobile/app/(app)/search.tsx"), "utf8");

  assert.match(screen, /Select/);
  assert.match(screen, /Select All/);
  assert.match(screen, /Clear Selection/);
  assert.match(screen, /Cancel/);
  assert.match(screen, /Bulk Status/);
  assert.match(screen, /selectionMode/);
  assert.match(screen, /selectAllVisibleLeads/);
  assert.match(screen, /clearLeadSelection/);
  assert.match(screen, /runBulkLeadStatusUpdates/);
  assert.match(screen, /api\.updateLeadStatus/);
  assert.match(screen, /BULK_STATUS_CONCURRENCY/);
  assert.match(screen, /Alert\.alert/);
  assert.match(screen, /bulkStatusConfirmationCopy/);
  assert.match(screen, /buildBulkStatusResult|formatBulkStatusResult/);
  assert.match(screen, /getProjectLeads/);
  assert.match(
    screen,
    /pathname:\s*["']\/projects\/\[projectId\]\/lead\/\[rowNumber\]["']|leadListDetailHref/
  );
  assert.match(screen, /formatBulkStatusProgress|Updating \$\{completed\} of \$\{total\}/);
  assert.match(screen, /bulkInFlight/);
  assert.doesNotMatch(screen, /bulkDelete|Delete Selected/i);
  assert.doesNotMatch(screen, /Bulk Remark|Add Remark to Selected/i);
  assert.doesNotMatch(screen, /Follow Up Selected|bulkFollowUp/i);
  assert.doesNotMatch(screen, /notification|reminder|calendar/i);
  assert.doesNotMatch(screen, /bulk-status|bulkUpdateStatus|\/bulk/i);
  assert.match(screen, /STATUS_FILTERS = \["All", \.\.\.LEAD_STATUSES, "Unknown"\]/);
  assert.match(screen, /\{LEAD_STATUSES\.map\(option =>/);
  assert.doesNotMatch(screen, /chooseBulkStatus\("Unknown"\)/);
  assert.doesNotMatch(screen, /CHATURX|ChaturX|Ankush CRM/);
  assert.doesNotMatch(screen, /redux|zustand|mobx/i);

  assert.match(card, /selectionMode/);
  assert.match(card, /selected/);
  assert.match(card, /openCall/);
  assert.match(card, /openWhatsApp/);
  assert.match(card, /!selectionMode/);

  assert.match(api, /updateLeadStatus/);
  assert.match(api, /\/api\/projects\/\$\{projectId\}\/leads\/\$\{rowNumber\}\/status/);
  assert.doesNotMatch(api, /bulkUpdateStatus|\/bulk-status|\/bulk-leads/);

  assert.doesNotMatch(server, /bulk-status|bulk-leads/);
  assert.doesNotMatch(db, /bulk_status|bulk_leads/);
  assert.doesNotMatch(pkg, /"redux"|"zustand"|"mobx"/);

  assert.match(leadDetail, /updateLeadStatus/);
  assert.equal(leadListDetailHref(9, 2), "/projects/9/lead/2");
  assert.match(dashboard, /Follow Up/);
  assert.match(search, /Clear Filters/);

  assert.doesNotMatch(screen, /password|SESSION_SECRET|TOKEN_ENCRYPTION|TURSO|refresh_token/i);
  assert.doesNotMatch(card, /password|SESSION_SECRET|TOKEN_ENCRYPTION/i);
});

test("unchanged bulk results do not invent timeline events from mobile", () => {
  const screen = fs.readFileSync(
    path.join(__dirname, "mobile/app/(app)/projects/[projectId]/index.tsx"),
    "utf8"
  );
  assert.doesNotMatch(screen, /STATUS_CHANGED|createTimeline|postTimeline|addTimeline/i);
  assert.equal(classifyBulkStatusOutcome({ unchanged: true, status: "Follow Up" }, null), "unchanged");
});
