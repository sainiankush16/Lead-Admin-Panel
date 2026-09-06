import type { ProjectLeadsResponse } from "@/types";
import type { DashboardSummary, StatusCounts } from "@/utils/dashboardSummary";

export type ActiveAnalyticsStatus =
  | "New"
  | "Contacted"
  | "Interested"
  | "Follow Up"
  | "Site Visit";

export type ClosedAnalyticsStatus = "Converted" | "Not Interested" | "Lost";

export interface AnalyticsCounts {
  statuses: StatusCounts;
  unknownStatusCount: number;
  total: number;
}

export interface ConversionRateResult {
  available: boolean;
  numerator: number;
  denominator: number;
  rate: number | null;
  percent: number | null;
  label: string;
  display: string;
  isPrediction: boolean;
  isForecast: boolean;
  isProbability: boolean;
}

export interface TopWorkStageResult {
  status: ActiveAnalyticsStatus | null;
  count: number;
  label: string;
  available: boolean;
}

export interface ProjectWorkloadRow {
  projectId: number;
  projectName: string;
  totalLeads: number;
  active: number;
  followUp: number;
  converted: number;
  closed: number;
  unknown: number;
}

export interface TopProjectWorkloadResult {
  available: boolean;
  projectId: number | null;
  projectName: string | null;
  active: number;
  followUp?: number;
  converted?: number;
  label: string;
}

export interface ProductivityAnalytics {
  empty: boolean;
  emptyLabel: string;
  active: number;
  closed: number;
  converted: number;
  followUp: number;
  unknown: number;
  totalTracked: number;
  conversion: ConversionRateResult;
  topWorkStage: TopWorkStageResult;
  projects: ProjectWorkloadRow[];
  topProject: TopProjectWorkloadResult;
  inventsScore: boolean;
  inventsForecast: boolean;
  inventsProbability: boolean;
  isPrediction: boolean;
  label: string;
}

// eslint-disable-next-line @typescript-eslint/no-require-imports
const core = require("./productivityAnalyticsCore.js");

export const ACTIVE_ANALYTICS_STATUSES = core.ACTIVE_ANALYTICS_STATUSES as readonly ActiveAnalyticsStatus[];
export const CLOSED_ANALYTICS_STATUSES = core.CLOSED_ANALYTICS_STATUSES as readonly ClosedAnalyticsStatus[];
export const TOP_WORK_STAGE_PRIORITY = core.TOP_WORK_STAGE_PRIORITY as readonly ActiveAnalyticsStatus[];

export const getActiveLeadCount = core.getActiveLeadCount as (counts?: unknown) => number;
export const getClosedLeadCount = core.getClosedLeadCount as (counts?: unknown) => number;
export const getConvertedLeadCount = core.getConvertedLeadCount as (counts?: unknown) => number;
export const getFollowUpCount = core.getFollowUpCount as (counts?: unknown) => number;
export const getUnknownLeadCount = core.getUnknownLeadCount as (counts?: unknown) => number;
export const getConversionRate = core.getConversionRate as (counts?: unknown) => ConversionRateResult;
export const getTopWorkStage = core.getTopWorkStage as (counts?: unknown) => TopWorkStageResult;
export const getProjectWorkload = core.getProjectWorkload as (
  projectLeadsOrSummary?: ProjectLeadsResponse[] | DashboardSummary | ProjectWorkloadRow[] | null
) => ProjectWorkloadRow[];
export const getTopProjectWorkload = core.getTopProjectWorkload as (
  projectLeadsOrWorkload?: ProjectLeadsResponse[] | DashboardSummary | ProjectWorkloadRow[] | null
) => TopProjectWorkloadResult;
export const getProductivityAnalytics = core.getProductivityAnalytics as (
  projectLeadsOrSummary?: ProjectLeadsResponse[] | DashboardSummary | null
) => ProductivityAnalytics;
export const inventsProductivityScore = core.inventsProductivityScore as () => boolean;
