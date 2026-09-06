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
