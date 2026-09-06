import type { LeadStatusValue } from "@/constants/leadStatus";
import type { Project } from "@/types";

// Pure aggregation lives in dashboardSummaryCore.js so Node tests can require it.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const core = require("./dashboardSummaryCore.js");

export type StatusCounts = Record<LeadStatusValue, number>;

export interface ProjectLeadSummary {
  projectId: number;
  projectName: string;
  leadCount: number;
  lastSync: string | null;
}

export interface DashboardSummary {
  totalLeads: number;
  statuses: StatusCounts;
  unknownStatusCount: number;
  projects: ProjectLeadSummary[];
  hasProjects: boolean;
  hasLeads: boolean;
}

export const emptyStatusCounts: () => StatusCounts = core.emptyStatusCounts;
export const classifyLeadStatus: (raw: unknown) => LeadStatusValue | "Unknown" = core.classifyLeadStatus;
export const statusFromLead: (
  lead: Record<string, unknown>,
  statusColumn: string | null | undefined
) => LeadStatusValue | "Unknown" = core.statusFromLead;
export const buildDashboardSummary: (projectLeads: unknown[]) => DashboardSummary =
  core.buildDashboardSummary;
export const greetingForDate: (date?: Date) => string = core.greetingForDate;

export function mapPool<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  return core.mapPool(items, concurrency, worker);
}

export type { Project };
