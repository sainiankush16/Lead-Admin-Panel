import type { LeadStatusValue } from "@/constants/leadStatus";
import type { TimelineEvent } from "@/types";

export type PrimaryLeadActionType = "call" | "email" | "review" | "none";

export interface PrimaryLeadAction {
  type: PrimaryLeadActionType;
  label: string;
  href: string | null;
}

export interface LeadProductivitySummary {
  status: LeadStatusValue | "Unknown";
  recommendation: string;
  stageHint: string;
  primaryAction: PrimaryLeadAction;
  showWhatsApp: boolean;
  activitySummary: string;
  quickStatuses: readonly string[];
  quickStatusSelectsOnly: boolean;
}

// eslint-disable-next-line @typescript-eslint/no-require-imports
const core = require("./leadProductivityCore.js");

export const QUICK_LEAD_STATUSES = core.QUICK_LEAD_STATUSES as readonly LeadStatusValue[];

export const getLeadProductivityStatus = core.getLeadProductivityStatus as (
  rawStatus: unknown
) => LeadStatusValue | "Unknown";

export const hasUsablePhone = core.hasUsablePhone as (telHref: unknown) => boolean;
export const hasUsableEmail = core.hasUsableEmail as (mailtoHref: unknown) => boolean;
export const hasUsableContact = core.hasUsableContact as (input?: {
  telHref?: string | null;
  mailtoHref?: string | null;
}) => boolean;

export const getLeadStageHint = core.getLeadStageHint as (rawStatus: unknown) => string;

export const getRecommendedLeadAction = core.getRecommendedLeadAction as (input?: {
  status?: unknown;
  telHref?: string | null;
  mailtoHref?: string | null;
}) => string;

export const getPrimaryLeadAction = core.getPrimaryLeadAction as (input?: {
  status?: unknown;
  telHref?: string | null;
  mailtoHref?: string | null;
}) => PrimaryLeadAction;

export const canShowSmartWhatsApp = core.canShowSmartWhatsApp as (input?: {
  status?: unknown;
  waHref?: string | null;
}) => boolean;

export const getLeadActivitySummary = core.getLeadActivitySummary as (
  events: TimelineEvent[] | null | undefined
) => string;

export const getQuickLeadStatusOptions = core.getQuickLeadStatusOptions as (
  currentStatus: unknown
) => LeadStatusValue[];

export const quickStatusSelectsOnly = core.quickStatusSelectsOnly as () => boolean;
export const contactActionsAutoChangeStatus = core.contactActionsAutoChangeStatus as () => boolean;
export const followUpActiveGuidance = core.followUpActiveGuidance as () => string;

export const buildLeadProductivitySummary = core.buildLeadProductivitySummary as (input?: {
  status?: unknown;
  telHref?: string | null;
  mailtoHref?: string | null;
  waHref?: string | null;
  timelineEvents?: TimelineEvent[] | null;
}) => LeadProductivitySummary;
