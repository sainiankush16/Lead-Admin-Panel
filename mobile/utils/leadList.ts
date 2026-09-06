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
