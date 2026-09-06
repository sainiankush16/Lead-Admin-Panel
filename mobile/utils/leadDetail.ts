import type { Lead, ProjectLeadsResponse } from "@/types";
import type { LeadStatusValue } from "@/constants/leadStatus";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const core = require("./leadDetailCore.js");

export interface LeadDetailField {
  header: string;
  value: string;
}

export interface LeadDetailModel {
  found: true;
  projectId: number;
  projectName: string;
  rowNumber: number;
  leadId: string;
  name: string;
  phone: string;
  email: string;
  status: LeadStatusValue | "Unknown";
  telHref: string | null;
  waHref: string | null;
  mailtoHref: string | null;
  fields: LeadDetailField[];
  lead: Lead;
  columns: string[];
}

export type LeadDetailResult =
  | LeadDetailModel
  | { found: false; error: "missing_project" | "invalid_row" | "not_found" };

export function displayFieldValue(raw: unknown): string {
  return core.displayFieldValue(raw);
}

export function buildMailtoHref(email: unknown): string | null {
  return core.buildMailtoHref(email);
}

export function buildLeadDetail(
  projectData: ProjectLeadsResponse | null | undefined,
  rowNumber: number | string
): LeadDetailResult {
  return core.buildLeadDetail(projectData, rowNumber);
}
