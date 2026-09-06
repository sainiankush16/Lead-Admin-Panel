"use strict";

const { formatRemarkTimestamp } = require("./leadRemarksCore");

const EVENT_TYPE_LABELS = Object.freeze({
  LEAD_GENERATED: "Lead Generated",
  STATUS_CHANGED: "Status Changed",
  REMARK_ADDED: "Remark Added",
  REMARK_EDITED: "Remark Edited",
  REMARK_DELETED: "Remark Deleted",
  PROJECT_ASSIGNED: "Project Assigned",
  PROJECT_UNASSIGNED: "Project Unassigned",
  TIMELINE_EVENT_EDITED: "Timeline Event Edited",
  TIMELINE_EVENT_DELETED: "Timeline Event Deleted"
});

function timelineEventTitle(eventType) {
  const key = String(eventType || "").trim();
  if (EVENT_TYPE_LABELS[key]) return EVENT_TYPE_LABELS[key];
  return "Activity";
}

function quoteText(value) {
  const text = String(value ?? "").trim();
  if (!text) return "";
  return `"${text}"`;
}

function safeEventData(event) {
  const data = event?.eventData;
  if (!data || typeof data !== "object" || Array.isArray(data)) return {};
  return data;
}

function timelineEventDetail(event) {
  if (!event) return "";
  if (event.isDeleted) {
    const data = safeEventData(event);
    return String(data.notice || data.title || "Event removed by Admin").trim();
  }

  const data = safeEventData(event);
  switch (String(event.eventType || "")) {
    case "STATUS_CHANGED": {
      const from = String(data.fromStatus ?? "").trim();
      const to = String(data.toStatus ?? "").trim();
      if (from && to) return `${from} → ${to}`;
      if (to) return to;
      return String(data.title || "").trim();
    }
    case "REMARK_ADDED":
      return quoteText(data.text);
    case "REMARK_EDITED": {
      const previous = String(data.previousText ?? "").trim();
      const next = String(data.text ?? "").trim();
      if (previous && next) return `Previous: "${previous}"\nUpdated: "${next}"`;
      if (next) return quoteText(next);
      return String(data.title || "").trim();
    }
    case "REMARK_DELETED":
      return quoteText(data.text) || String(data.title || "").trim();
    case "LEAD_GENERATED": {
      const source = String(data.source ?? "").trim();
      return source ? `Source: ${source}` : "";
    }
    case "PROJECT_ASSIGNED":
    case "PROJECT_UNASSIGNED":
      return String(data.title || data.notice || "").trim();
    case "TIMELINE_EVENT_EDITED":
    case "TIMELINE_EVENT_DELETED":
      return String(data.notice || data.title || data.reason || "").trim();
    default:
      return String(data.notice || data.title || data.text || "").trim();
  }
}

function timelineActorLabel(event) {
  const actor = event?.actor || {};
  const name = String(actor.name || "").trim();
  if (name) return name;
  const loginId = String(actor.loginId || "").trim();
  if (loginId) return loginId;
  const data = safeEventData(event);
  const label = String(data.actorLabel || "").trim();
  if (label) return label;
  if (actor.role === "system") return "System";
  return "System";
}

function formatTimelineTimestamp(value) {
  return formatRemarkTimestamp(value);
}

function mapTimelineDisplayItems(events) {
  const list = Array.isArray(events) ? events : [];
  // Preserve server order (newest-first from API).
  return list.map(event => ({
    id: Number(event.id),
    eventType: String(event.eventType || ""),
    title: timelineEventTitle(event.eventType),
    detail: timelineEventDetail(event),
    actor: timelineActorLabel(event),
    timestamp: formatTimelineTimestamp(event.createdAt),
    isDeleted: Boolean(event.isDeleted)
  }));
}

function mapTimelineLoadError(err) {
  if (!err) return { message: "Unable to load timeline.", clearAuth: false };
  if (err.name === "TypeError") {
    return { message: "Unable to load timeline.", clearAuth: false };
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
  return { message: "Unable to load timeline.", clearAuth: false };
}

/** Timeline UI is GET-only — no mutation helpers are exported for screens. */
function timelineIsReadOnly() {
  return true;
}

module.exports = {
  EVENT_TYPE_LABELS,
  timelineEventTitle,
  timelineEventDetail,
  timelineActorLabel,
  formatTimelineTimestamp,
  mapTimelineDisplayItems,
  mapTimelineLoadError,
  timelineIsReadOnly
};
