import type { Lead, ProjectLeadsResponse } from "@/types";
import type { LeadStatusValue } from "@/constants/leadStatus";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const core = require("./leadListCore.js");

export interface LeadListItem {
  rowNumber: number;
  leadId: string;
  name: string;
  phone: string;
  email: string;
  status: LeadStatusValue | "Unknown";
  telHref: string | null;
  waHref: string | null;
  lead: Lead;
  columns: string[];
}

export function buildLeadListItems(projectData: ProjectLeadsResponse): LeadListItem[] {
  return core.buildLeadListItems(projectData);
}

export function filterLeadListItems(
  items: LeadListItem[],
  options: { query?: string; status?: string } = {}
): LeadListItem[] {
  return core.filterLeadListItems(items, options);
}

export function areLeadListFiltersActive(options: {
  query?: string;
  status?: string;
} = {}): boolean {
  return core.areLeadListFiltersActive(options);
}

export function formatLeadListCount(options: {
  filteredCount: number;
  totalCount: number;
  filtersActive: boolean;
}): string {
  return core.formatLeadListCount(options);
}

export const displayLeadListName = core.displayLeadListName as (name: unknown) => string;
export const displayLeadListPhone = core.displayLeadListPhone as (phone: unknown) => string;
export const displayLeadListEmail = core.displayLeadListEmail as (email: unknown) => string;
export const displayLeadListStatus = core.displayLeadListStatus as (status: unknown) => string;
export const leadListDetailHref = core.leadListDetailHref as (
  projectId: number,
  rowNumber: number
) => string | null;
export const clearLeadListFilters = core.clearLeadListFilters as <T extends Record<string, unknown>>(
  state?: T
) => T & { query: string; status: string };
export const leadListScrollRestorationStrategy = core.leadListScrollRestorationStrategy as () => string;

export type BulkStatusOutcome = "updated" | "unchanged" | "failed";

export interface BulkStatusSummary {
  total: number;
  updated: number;
  unchanged: number;
  failed: number;
  succeeded: number;
}

export interface BulkStatusProgress {
  completed: number;
  total: number;
  rowNumber: number;
  outcome: BulkStatusOutcome;
}

export const BULK_STATUS_CONCURRENCY = core.BULK_STATUS_CONCURRENCY as number;

export const selectionKeyFromRowNumber = core.selectionKeyFromRowNumber as (
  rowNumber: unknown
) => string | null;

export const toggleLeadSelection = core.toggleLeadSelection as (
  selectedKeys: Set<string> | string[] | null | undefined,
  rowNumber: unknown
) => Set<string>;

export const selectAllVisibleLeads = core.selectAllVisibleLeads as (
  visibleItems: Array<{ rowNumber?: number } | null | undefined>
) => Set<string>;

export const clearLeadSelection = core.clearLeadSelection as () => Set<string>;

export const selectedLeadCount = core.selectedLeadCount as (
  selectedKeys: Set<string> | string[] | null | undefined
) => number;

export const formatSelectionCount = core.formatSelectionCount as (count: unknown) => string;

export const canEnableBulkStatus = core.canEnableBulkStatus as (options: {
  selectedCount: number;
  busy?: boolean;
}) => boolean;

export const bulkStatusConfirmationCopy = core.bulkStatusConfirmationCopy as (
  count: number,
  status: string
) => { title: string; message: string; cancel: string; confirm: string };

export const classifyBulkStatusOutcome = core.classifyBulkStatusOutcome as (
  response: unknown,
  error?: unknown
) => BulkStatusOutcome;

export const emptyBulkStatusSummary = core.emptyBulkStatusSummary as (
  total?: number
) => BulkStatusSummary;

export const aggregateBulkStatusResults = core.aggregateBulkStatusResults as (
  outcomes: BulkStatusOutcome[]
) => BulkStatusSummary;

export const formatBulkStatusResult = core.formatBulkStatusResult as (
  summary: BulkStatusSummary
) => string;

export const runBulkLeadStatusUpdates = core.runBulkLeadStatusUpdates as (options: {
  projectId: number;
  rowNumbers: number[];
  status: string;
  updateLeadStatus: (
    projectId: number,
    rowNumber: number,
    status: string
  ) => Promise<unknown>;
  concurrency?: number;
  onProgress?: (progress: BulkStatusProgress) => void;
}) => Promise<BulkStatusSummary>;
