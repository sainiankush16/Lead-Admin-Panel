import type { LeadStatusValue } from "@/constants/leadStatus";
import type { Remark, TimelineEvent } from "@/types";

export type ConversionReadiness =
  | "Early Stage"
  | "Engaged"
  | "Action Required"
  | "Converted"
  | "Closed / Not Interested"
  | "Closed / Lost"
  | "Unknown";

export type LeadProgressKind = "progress" | "terminal" | "unknown";

export interface LeadProgress {
  kind: LeadProgressKind;
  status: LeadStatusValue | "Unknown";
  stages: string[];
  currentIndex: number;
  terminalStatus: string | null;
  description: string;
  unavailableLabel: string | null;
}

export interface LeadQualificationSignals {
  nameAvailable: boolean;
  phoneAvailable: boolean;
  emailAvailable: boolean;
  activityAvailable: boolean;
  remarksAvailable: boolean;
  nameLabel: string;
  phoneLabel: string;
  emailLabel: string;
  activityLabel: string;
  remarksLabel: string;
}

export interface LeadMissingInformation {
  items: string[];
  contactComplete: boolean;
  summary: string;
}

export interface LeadActivityIntelligence {
  available: boolean;
  count: number;
  latestLabel: string | null;
  summary: string;
}

export interface LeadRemarksIntelligence {
  available: boolean;
  count: number;
  summary: string;
}

export interface LeadIntelligence {
  status: LeadStatusValue | "Unknown";
  progress: LeadProgress;
  readiness: ConversionReadiness;
  stageSummary: string;
  signals: LeadQualificationSignals;
  missing: LeadMissingInformation;
  activity: LeadActivityIntelligence;
  remarks: LeadRemarksIntelligence;
  displayName: string;
  inventsConversionScore: boolean;
}

// eslint-disable-next-line @typescript-eslint/no-require-imports
const core = require("./leadIntelligenceCore.js");

export const CONVERSION_PROGRESS_STAGES = core.CONVERSION_PROGRESS_STAGES as readonly string[];
export const TERMINAL_STATUSES = core.TERMINAL_STATUSES as readonly string[];

export const getLeadIntelligenceStatus = core.getLeadIntelligenceStatus as (
  rawStatus: unknown
) => LeadStatusValue | "Unknown";

export const hasUsableName = core.hasUsableName as (name: unknown) => boolean;
export const hasUsablePhoneValue = core.hasUsablePhoneValue as (input?: {
  phone?: string | null;
  telHref?: string | null;
}) => boolean;
export const hasUsableEmailValue = core.hasUsableEmailValue as (input?: {
  email?: string | null;
  mailtoHref?: string | null;
}) => boolean;

export const getLeadStageSummary = core.getLeadStageSummary as (rawStatus: unknown) => string;
export const getLeadConversionReadiness = core.getLeadConversionReadiness as (
  rawStatus: unknown
) => ConversionReadiness;
export const getLeadProgress = core.getLeadProgress as (rawStatus: unknown) => LeadProgress;
export const getLeadQualificationSignals = core.getLeadQualificationSignals as (input?: {
  name?: string | null;
  phone?: string | null;
  email?: string | null;
  telHref?: string | null;
  mailtoHref?: string | null;
  timelineEvents?: TimelineEvent[] | null;
  remarks?: Remark[] | null;
}) => LeadQualificationSignals;

export const getLeadMissingInformation = core.getLeadMissingInformation as (input?: {
  name?: string | null;
  phone?: string | null;
  email?: string | null;
  telHref?: string | null;
  mailtoHref?: string | null;
}) => LeadMissingInformation;

export const getLeadActivityIntelligence = core.getLeadActivityIntelligence as (
  events: TimelineEvent[] | null | undefined
) => LeadActivityIntelligence;

export const getLeadRemarksIntelligence = core.getLeadRemarksIntelligence as (
  remarks: Remark[] | null | undefined
) => LeadRemarksIntelligence;

export const inventsConversionScore = core.inventsConversionScore as () => boolean;

export const getLeadIntelligence = core.getLeadIntelligence as (input?: {
  status?: unknown;
  name?: string | null;
  phone?: string | null;
  email?: string | null;
  telHref?: string | null;
  mailtoHref?: string | null;
  timelineEvents?: TimelineEvent[] | null;
  remarks?: Remark[] | null;
}) => LeadIntelligence;
