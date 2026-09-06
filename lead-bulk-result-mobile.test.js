"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const {
  aggregateBulkStatusResults,
  buildBulkStatusResult,
  classifyBulkResultKind,
  classifyBulkStatusOutcome,
  formatBulkStatusProgress,
  formatBulkStatusResult,
  runBulkLeadStatusUpdates,
  BULK_STATUS_CONCURRENCY
} = require("./mobile/utils/leadListCore");

test("bulk result kinds classify success partial and failure correctly", () => {
  const success = aggregateBulkStatusResults(["updated", "updated", "unchanged"], "Follow Up");
  assert.equal(success.total, 3);
  assert.equal(success.updated + success.unchanged + success.failed, success.total);
  assert.equal(success.targetStatus, "Follow Up");
  assert.equal(classifyBulkResultKind(success), "success");

  const partial = aggregateBulkStatusResults(
    ["updated", "unchanged", "failed", "failed"],
    "Contacted"
  );
  assert.equal(partial.updated + partial.unchanged + partial.failed, partial.total);
  assert.equal(classifyBulkResultKind(partial), "partial");

  const failure = aggregateBulkStatusResults(["failed", "failed"], "New");
  assert.equal(failure.failed, failure.total);
  assert.equal(classifyBulkResultKind(failure), "failure");
});

test("buildBulkStatusResult success wording preserves target and unchanged distinction", () => {
  const allUpdated = buildBulkStatusResult(
    { total: 5, updated: 5, unchanged: 0, failed: 0, succeeded: 5 },
    "Follow Up"
  );
  assert.equal(allUpdated.kind, "success");
  assert.equal(allUpdated.targetStatus, "Follow Up");
  assert.equal(allUpdated.headline, "5 leads updated to Follow Up");
  assert.equal(allUpdated.retryHint, null);
  assert.match(allUpdated.accessibilityLabel, /Target Status: Follow Up/);

  const allUnchanged = buildBulkStatusResult(
    { total: 5, updated: 0, unchanged: 5, failed: 0, succeeded: 5 },
    "Follow Up"
  );
  assert.equal(allUnchanged.headline, "5 leads were already Follow Up");
  assert.equal(classifyBulkStatusOutcome({ unchanged: true }, null), "unchanged");

  const mixed = buildBulkStatusResult(
    { total: 5, updated: 4, unchanged: 1, failed: 0, succeeded: 5 },
    "Follow Up"
  );
  assert.equal(mixed.headline, "5 leads processed");
  assert.ok(mixed.details.includes("4 status changes"));
  assert.ok(mixed.details.includes("1 already Follow Up"));
});

test("buildBulkStatusResult partial and complete failure copy", () => {
  const partial = buildBulkStatusResult(
    { total: 5, updated: 2, unchanged: 1, failed: 2, succeeded: 3 },
    "Follow Up"
  );
  assert.equal(partial.kind, "partial");
  assert.equal(partial.headline, "3 of 5 processed successfully");
  assert.ok(partial.details.includes("2 failed"));
  assert.ok(partial.details.includes("1 already Follow Up"));
  assert.equal(partial.targetStatus, "Follow Up");
  assert.match(partial.retryHint || "", /selected again and retried manually/);

  const failure = buildBulkStatusResult(
    { total: 5, updated: 0, unchanged: 0, failed: 5, succeeded: 0 },
    "Contacted"
  );
  assert.equal(failure.kind, "failure");
  assert.equal(failure.headline, "0 of 5 updated");
  assert.ok(failure.details.includes("5 failed"));
  assert.equal(failure.targetStatus, "Contacted");
  assert.match(failure.accessibilityLabel, /0 of 5 updated/);
  assert.doesNotMatch(failure.accessibilityLabel, /updated successfully/i);
});

test("progress formatting and Phase 21 one-line formatter remain accurate", () => {
  assert.equal(formatBulkStatusProgress({ completed: 3, total: 8 }), "Updating 3 of 8...");
  assert.equal(formatBulkStatusProgress({}), "Updating leads...");
  assert.equal(
    formatBulkStatusResult({
      total: 2,
      updated: 2,
      unchanged: 0,
      failed: 0,
      succeeded: 2
    }),
    "2 leads updated successfully."
  );
});

test("runBulkLeadStatusUpdates attaches targetStatus without automatic retry", async () => {
  let calls = 0;
  const summary = await runBulkLeadStatusUpdates({
    projectId: 9,
    rowNumbers: [2, 3],
    status: "Site Visit",
    concurrency: BULK_STATUS_CONCURRENCY,
    updateLeadStatus: async (_pid, row) => {
      calls += 1;
      if (row === 3) throw new TypeError("network");
      return { ok: true, status: "Site Visit" };
    }
  });
  assert.equal(calls, 2);
  assert.equal(summary.targetStatus, "Site Visit");
  assert.equal(summary.updated, 1);
  assert.equal(summary.failed, 1);
  assert.equal(summary.updated + summary.unchanged + summary.failed, summary.total);
  assert.ok(BULK_STATUS_CONCURRENCY <= 4);

  const view = buildBulkStatusResult(summary);
  assert.equal(view.targetStatus, "Site Visit");
  assert.equal(view.kind, "partial");
});

test("Lead List shows dismissible bulk result card without new APIs or future features", () => {
  const screen = fs.readFileSync(
    path.join(__dirname, "mobile/app/(app)/projects/[projectId]/index.tsx"),
    "utf8"
  );
  const api = fs.readFileSync(path.join(__dirname, "mobile/services/api.ts"), "utf8");
  const server = fs.readFileSync(path.join(__dirname, "server.js"), "utf8");
  const db = fs.readFileSync(path.join(__dirname, "db.js"), "utf8");
  const pkg = fs.readFileSync(path.join(__dirname, "mobile/package.json"), "utf8");
  const continuity = fs.readFileSync(
    path.join(__dirname, "mobile/app/(app)/projects/[projectId]/index.tsx"),
    "utf8"
  );
  const detail = fs.readFileSync(
    path.join(__dirname, "mobile/app/(app)/projects/[projectId]/lead/[rowNumber].tsx"),
    "utf8"
  );
  const dashboard = fs.readFileSync(path.join(__dirname, "mobile/app/(app)/index.tsx"), "utf8");
  const search = fs.readFileSync(path.join(__dirname, "mobile/app/(app)/search.tsx"), "utf8");

  assert.match(screen, /buildBulkStatusResult/);
  assert.match(screen, /formatBulkStatusProgress/);
  assert.match(screen, /Bulk Status Result/);
  assert.match(screen, /Target Status/);
  assert.match(screen, /Dismiss bulk result/);
  assert.match(screen, /dismissBulkResult/);
  assert.match(screen, /bulkInFlight/);
  assert.match(screen, /api\.updateLeadStatus/);
  assert.match(screen, /BULK_STATUS_CONCURRENCY/);
  assert.match(screen, /getProjectLeads/);
  assert.match(screen, /useFocusEffect/);
  assert.match(screen, /filterLeadListItems/);
  assert.match(screen, /bulkResult\.retryHint/);
  assert.match(screen, /dismissBulkResult/);
  assert.doesNotMatch(screen, /retryQueue|Retry Failed|bulkUpdateStatus|\/bulk-status/);
  assert.doesNotMatch(screen, /bulkDelete|Delete Selected|Bulk Remark|Follow Up Selected/i);
  assert.doesNotMatch(screen, /notification|reminder|calendar|AsyncStorage/i);
  assert.doesNotMatch(screen, /STATUS_CHANGED|BULK_STATUS_CHANGED|createTimeline/i);
  assert.doesNotMatch(screen, /CHATURX|ChaturX|Ankush CRM/);
  assert.doesNotMatch(screen, /redux|zustand|mobx/i);
  assert.doesNotMatch(screen, /password|SESSION_SECRET|TOKEN_ENCRYPTION|TURSO/i);

  assert.doesNotMatch(api, /bulkUpdateStatus|\/bulk-status|\/bulk-leads/);
  assert.doesNotMatch(server, /bulk-status|bulk-leads|bulk_operations/);
  assert.doesNotMatch(db, /bulk_operations|bulk_results|CREATE TABLE.*bulk/i);
  assert.doesNotMatch(pkg, /"redux"|"zustand"|"mobx"/);

  assert.match(continuity, /load\("focus"\)/);
  assert.match(detail, /updateLeadStatus/);
  assert.match(dashboard, /Follow Up/);
  assert.match(search, /Clear Filters/);
});
