import type { LeadStatusValue } from "@/constants/leadStatus";
import type { ProjectLeadsResponse } from "@/types";

export type ActionCenterStatus =
  | "Follow Up"
  | "Interested"
  | "Site Visit"
  | "New"
  | "Contacted";

export interface ActionCenterItem {
  projectId: number;
  projectName: string;
  rowNumber: number;
  name: string;
  phone: string;
  email: string;
  status: ActionCenterStatus | LeadStatusValue | "Unknown";
  priority: number;
  phoneAvailable: boolean;
  emailAvailable: boolean;
  contactLabel: string;
  detailHref: string;
}

export interface ActionCenterCounts {
  "Follow Up": number;
  Interested: number;
  "Site Visit": number;
  New: number;
  Contacted: number;
  total: number;
}

export interface ActionCenterPriority {
  status: ActionCenterStatus | null;
  count: number;
  label: string;
}

export interface ActionCenterSummary {
  counts: ActionCenterCounts;
  priority: ActionCenterPriority;
  filter: string;
  visibleItems: ActionCenterItem[];
  totalMatching: number;
  hasMore: boolean;
  limit: number;
  empty: boolean;
  emptyLabel: string;
  inventsScore: boolean;
  filterOptions: string[];
}

// eslint-disable-next-line @typescript-eslint/no-require-imports
const core = require("./actionCenterCore.js");

export const ACTION_CENTER_STATUSES = core.ACTION_CENTER_STATUSES as readonly ActionCenterStatus[];
export const ACTION_CENTER_PRIORITY = core.ACTION_CENTER_PRIORITY as Readonly<
  Record<ActionCenterStatus, number>
>;
export const ACTION_CENTER_VISIBLE_LIMIT = core.ACTION_CENTER_VISIBLE_LIMIT as number;

export const getActionPriority = core.getActionPriority as (rawStatus: unknown) => number | null;
export const isActionCenterStatus = core.isActionCenterStatus as (rawStatus: unknown) => boolean;
export const getActionCenterLabel = core.getActionCenterLabel as (
  rawStatus: unknown
) => ActionCenterStatus | null;

export const collectActionCenterItems = core.collectActionCenterItems as (
  projectLeads: ProjectLeadsResponse[] | null | undefined
) => ActionCenterItem[];

export const getActionCenterCounts = core.getActionCenterCounts as (
  items: ActionCenterItem[] | null | undefined
) => ActionCenterCounts;

export const getActionCenterPriority = core.getActionCenterPriority as (
  countsInput: ActionCenterCounts | null | undefined
) => ActionCenterPriority;

export const getActionCenterItems = core.getActionCenterItems as (
  items: ActionCenterItem[] | null | undefined,
  options?: { filter?: string; limit?: number }
) => {
  items: ActionCenterItem[];
  totalMatching: number;
  hasMore: boolean;
  limit: number;
};

export const getActionCenterSummary = core.getActionCenterSummary as (
  projectLeads: ProjectLeadsResponse[] | null | undefined,
  options?: { filter?: string; limit?: number }
) => ActionCenterSummary;

export const inventsActionScore = core.inventsActionScore as () => boolean;
