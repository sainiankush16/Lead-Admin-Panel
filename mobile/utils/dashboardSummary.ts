import type { LeadStatusValue } from "@/constants/leadStatus";
import type { Project } from "@/types";

// Pure aggregation lives in dashboardSummaryCore.js so Node tests can require it.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const core = require("./dashboardSummaryCore.js");

export type StatusCounts = Record<LeadStatusValue, number>;

export type ActionableStatus = "Follow Up" | "New" | "Interested" | "Site Visit";

export type ActionableCounts = Record<ActionableStatus, number>;

export interface ProjectLeadSummary {
  projectId: number;
  projectName: string;
  leadCount: number;
  lastSync: string | null;
  statusCounts: StatusCounts;
  unknownStatusCount: number;
}

export interface DashboardSummary {
  totalLeads: number;
  statuses: StatusCounts;
  actionable: ActionableCounts;
  unknownStatusCount: number;
  projects: ProjectLeadSummary[];
  hasProjects: boolean;
  hasLeads: boolean;
}

export interface ActionableLeadTarget {
  projectId: number;
  projectName: string;
  status: ActionableStatus;
  count: number;
}

export const ACTIONABLE_STATUSES: readonly ActionableStatus[] = core.ACTIONABLE_STATUSES;
export const emptyStatusCounts: () => StatusCounts = core.emptyStatusCounts;
export const emptyActionableCounts: () => ActionableCounts = core.emptyActionableCounts;
export const isActionableStatus: (value: unknown) => boolean = core.isActionableStatus;
export const classifyLeadStatus: (raw: unknown) => LeadStatusValue | "Unknown" = core.classifyLeadStatus;
export const statusFromLead: (
  lead: Record<string, unknown>,
  statusColumn: string | null | undefined
) => LeadStatusValue | "Unknown" = core.statusFromLead;
export const buildDashboardSummary: (projectLeads: unknown[]) => DashboardSummary =
  core.buildDashboardSummary;
export const resolveActionableLeadTarget: (
  summary: DashboardSummary | null | undefined,
  status: string
) => ActionableLeadTarget | null = core.resolveActionableLeadTarget;
export const normalizeLeadListStatusParam: (raw: unknown) => string | null =
  core.normalizeLeadListStatusParam;
export const buildLeadListPath: (projectId: number, status?: string | null) => string | null =
  core.buildLeadListPath;
export const greetingForDate: (date?: Date) => string = core.greetingForDate;

export function mapPool<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  return core.mapPool(items, concurrency, worker);
}

export type { Project };
