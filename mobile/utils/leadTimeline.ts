import type { TimelineEvent } from "@/types";

// Shared pure logic (also covered by Node tests).
// eslint-disable-next-line @typescript-eslint/no-require-imports
const core = require("./leadTimelineCore.js") as {
  EVENT_TYPE_LABELS: Record<string, string>;
  timelineEventTitle: (eventType: string | null | undefined) => string;
  timelineEventDetail: (event: TimelineEvent | null | undefined) => string;
  timelineActorLabel: (event: TimelineEvent | null | undefined) => string;
  formatTimelineTimestamp: (value: string | null | undefined) => string;
  mapTimelineDisplayItems: (events: TimelineEvent[] | null | undefined) => Array<{
    id: number;
    eventType: string;
    title: string;
    detail: string;
    actor: string;
    timestamp: string;
    isDeleted: boolean;
  }>;
  mapTimelineLoadError: (err: { status?: number; name?: string } | null | undefined) => {
    message: string;
    clearAuth: boolean;
  };
  timelineIsReadOnly: () => boolean;
};

export const EVENT_TYPE_LABELS = core.EVENT_TYPE_LABELS;
export const timelineEventTitle = core.timelineEventTitle;
export const timelineEventDetail = core.timelineEventDetail;
export const timelineActorLabel = core.timelineActorLabel;
export const formatTimelineTimestamp = core.formatTimelineTimestamp;
export const mapTimelineDisplayItems = core.mapTimelineDisplayItems;
export const mapTimelineLoadError = core.mapTimelineLoadError;
export const timelineIsReadOnly = core.timelineIsReadOnly;

export type TimelineDisplayItem = ReturnType<typeof mapTimelineDisplayItems>[number];
