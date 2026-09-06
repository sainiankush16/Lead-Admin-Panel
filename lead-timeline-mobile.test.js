"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const {
  EVENT_TYPE_LABELS,
  timelineEventTitle,
  timelineEventDetail,
  timelineActorLabel,
  formatTimelineTimestamp,
  mapTimelineDisplayItems,
  mapTimelineLoadError,
  timelineIsReadOnly
} = require("./mobile/utils/leadTimelineCore");

function event(partial) {
  return {
    id: 1,
    projectId: 1,
    leadId: "5",
    eventType: "LEAD_GENERATED",
    eventData: {},
    actor: { userId: null, role: "system", name: null, loginId: null },
    createdAt: "2026-09-06 10:42:00",
    isDeleted: false,
    ...partial
  };
}

test("empty timeline maps to empty display list", () => {
  assert.deepEqual(mapTimelineDisplayItems([]), []);
  assert.deepEqual(mapTimelineDisplayItems(null), []);
});

test("known event type labels are human-readable", () => {
  assert.equal(timelineEventTitle("LEAD_GENERATED"), "Lead Generated");
  assert.equal(timelineEventTitle("STATUS_CHANGED"), "Status Changed");
  assert.equal(timelineEventTitle("REMARK_ADDED"), "Remark Added");
  assert.equal(timelineEventTitle("REMARK_EDITED"), "Remark Edited");
  assert.equal(timelineEventTitle("REMARK_DELETED"), "Remark Deleted");
  assert.equal(timelineEventTitle("PROJECT_ASSIGNED"), "Project Assigned");
  assert.equal(timelineEventTitle("PROJECT_UNASSIGNED"), "Project Unassigned");
  assert.equal(timelineEventTitle("TIMELINE_EVENT_EDITED"), "Timeline Event Edited");
  assert.equal(timelineEventTitle("TIMELINE_EVENT_DELETED"), "Timeline Event Deleted");
  assert.equal(Object.keys(EVENT_TYPE_LABELS).length, 9);
});

test("STATUS_CHANGED extracts old and new status", () => {
  const detail = timelineEventDetail(event({
    eventType: "STATUS_CHANGED",
    eventData: { fromStatus: "New", toStatus: "Contacted" }
  }));
  assert.equal(detail, "New → Contacted");
  assert.equal(
    timelineEventDetail(event({ eventType: "STATUS_CHANGED", eventData: { title: "Status Changed" } })),
    "Status Changed"
  );
});

test("remark event content extraction", () => {
  assert.equal(
    timelineEventDetail(event({
      eventType: "REMARK_ADDED",
      eventData: { text: "Customer interested in site visit." }
    })),
    '"Customer interested in site visit."'
  );
  assert.match(
    timelineEventDetail(event({
      eventType: "REMARK_EDITED",
      eventData: { previousText: "Old", text: "New text" }
    })),
    /Previous: "Old"/
  );
  assert.equal(
    timelineEventDetail(event({
      eventType: "REMARK_DELETED",
      eventData: { text: "Removed note" }
    })),
    '"Removed note"'
  );
});

test("LEAD_GENERATED and administrative events", () => {
  assert.equal(
    timelineEventDetail(event({
      eventType: "LEAD_GENERATED",
      eventData: { source: "Facebook" }
    })),
    "Source: Facebook"
  );
  assert.equal(timelineEventDetail(event({ eventType: "LEAD_GENERATED", eventData: {} })), "");
  assert.equal(
    timelineEventDetail(event({
      eventType: "PROJECT_ASSIGNED",
      eventData: { title: "Project Assigned" }
    })),
    "Project Assigned"
  );
  assert.equal(
    timelineEventDetail(event({
      eventType: "PROJECT_UNASSIGNED",
      eventData: { title: "Project Unassigned" }
    })),
    "Project Unassigned"
  );
  assert.equal(
    timelineEventDetail(event({
      eventType: "TIMELINE_EVENT_EDITED",
      eventData: { notice: "Corrected by Admin" }
    })),
    "Corrected by Admin"
  );
  assert.equal(
    timelineEventDetail(event({
      eventType: "TIMELINE_EVENT_DELETED",
      eventData: { notice: "Removed by Admin" }
    })),
    "Removed by Admin"
  );
});

test("unknown event type and deleted event handling", () => {
  assert.equal(timelineEventTitle("FUTURE_EVENT"), "Activity");
  assert.equal(
    timelineEventDetail(event({
      eventType: "FUTURE_EVENT",
      eventData: { title: "Something happened" }
    })),
    "Something happened"
  );
  assert.equal(
    timelineEventDetail(event({
      isDeleted: true,
      eventData: { notice: "Event removed by Admin" }
    })),
    "Event removed by Admin"
  );
});

test("actor and timestamp display", () => {
  assert.equal(
    timelineActorLabel(event({
      actor: { userId: 1, role: "admin", name: "Anshul", loginId: "anshul" }
    })),
    "Anshul"
  );
  assert.equal(
    timelineActorLabel(event({
      actor: { userId: null, role: "system", name: null, loginId: null },
      eventData: { actorLabel: "Google Sheets Sync" }
    })),
    "Google Sheets Sync"
  );
  assert.equal(timelineActorLabel(event({ actor: { userId: null, role: "system", name: null, loginId: null } })), "System");
  const stamped = formatTimelineTimestamp("2026-09-06 10:42:00");
  assert.ok(stamped);
  assert.notEqual(stamped, "undefined");
});

test("display mapping preserves server order and long remark text", () => {
  const long = "A".repeat(400);
  const items = mapTimelineDisplayItems([
    event({ id: 3, eventType: "REMARK_ADDED", eventData: { text: long } }),
    event({
      id: 2,
      eventType: "STATUS_CHANGED",
      eventData: { fromStatus: "New", toStatus: "Contacted" },
      actor: { userId: 1, role: "admin", name: "Anshul", loginId: "a" }
    }),
    event({ id: 1, eventType: "LEAD_GENERATED" })
  ]);
  assert.equal(items.length, 3);
  assert.equal(items[0].id, 3);
  assert.equal(items[1].title, "Status Changed");
  assert.equal(items[1].detail, "New → Contacted");
  assert.equal(items[2].title, "Lead Generated");
  assert.ok(items[0].detail.includes(long));
});

test("error mapping and read-only guarantee", () => {
  assert.equal(mapTimelineLoadError({ status: 401 }).message, "Session expired. Please login again.");
  assert.equal(mapTimelineLoadError({ status: 403 }).message, "You don't have access to this project.");
  assert.equal(mapTimelineLoadError({ status: 404 }).message, "Lead not found.");
  assert.equal(mapTimelineLoadError({ status: 500 }).message, "Unable to load timeline.");
  assert.equal(mapTimelineLoadError({ name: "TypeError" }).message, "Unable to load timeline.");
  assert.equal(timelineIsReadOnly(), true);
});

test("mobile API client exposes GET timeline only for lead timeline helper", () => {
  const source = fs.readFileSync(path.join(__dirname, "mobile/services/api.ts"), "utf8");
  assert.match(source, /getLeadTimeline\(projectId: number, leadId: string\)/);
  assert.match(source, /\/api\/projects\/\$\{projectId\}\/leads\/\$\{encodeURIComponent\(leadId\)\}\/timeline/);
  const start = source.indexOf("getLeadTimeline(");
  const end = source.indexOf("globalLeadSearch(", start);
  assert.ok(start >= 0 && end > start);
  const timelineHelper = source.slice(start, end);
  assert.doesNotMatch(timelineHelper, /method:\s*"(POST|PATCH|DELETE)"/);
  const section = fs.readFileSync(
    path.join(__dirname, "mobile/components/LeadTimelineSection.tsx"),
    "utf8"
  );
  assert.doesNotMatch(section, /api\.(add|update|delete|post|patch)/i);
  assert.doesNotMatch(section, /Save Event|Delete Event|Add Event/);
});
