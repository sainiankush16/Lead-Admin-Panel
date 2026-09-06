import type { LeadStatusValue } from "@/constants/leadStatus";
import type { DashboardSummary, StatusCounts } from "@/utils/dashboardSummary";

export interface PipelineCounts {
  statuses: StatusCounts;
  unknownStatusCount: number;
  total: number;
}

export interface PipelineStageCount {
  status: string;
  count: number;
}

export interface AttentionStage {
  status: string | null;
  count: number;
  label: string;
}

export interface PipelineSummary extends PipelineCounts {
  active: PipelineStageCount[];
  terminal: PipelineStageCount[];
  attention: AttentionStage;
  health: string;
  inventsScore: boolean;
}

export interface PipelineConversionContext {
  currentStage: LeadStatusValue | "Unknown";
  nextStage: LeadStatusValue | null;
  nextStageLabel: string;
  moveToLabel: string | null;
  typicalNextLabel: string;
}

export interface PipelineLeadTarget {
  projectId: number;
  projectName: string;
  status: string;
  count: number;
  path: string | null;
}

// eslint-disable-next-line @typescript-eslint/no-require-imports
const core = require("./pipelineCore.js");

export const ACTIVE_PIPELINE_STAGES = core.ACTIVE_PIPELINE_STAGES as readonly LeadStatusValue[];
export const TERMINAL_PIPELINE_STAGES = core.TERMINAL_PIPELINE_STAGES as readonly LeadStatusValue[];
export const ATTENTION_PRIORITY = core.ATTENTION_PRIORITY as readonly LeadStatusValue[];

export const getPipelineCounts = core.getPipelineCounts as (
  leadsOrCounts: unknown,
  statusColumn?: string | null
) => PipelineCounts;

export const getPipelineStageCount = core.getPipelineStageCount as (
  counts: PipelineCounts | StatusCounts | null | undefined,
  status: string
) => number;

export const getPipelineStageOrder = core.getPipelineStageOrder as () => {
  active: string[];
  terminal: string[];
  attentionPriority: string[];
};

export const getNextPipelineStage = core.getNextPipelineStage as (
  rawStatus: unknown
) => LeadStatusValue | null;

export const getAttentionStage = core.getAttentionStage as (
  countsInput: unknown
) => AttentionStage;

export const getPipelineHealth = core.getPipelineHealth as (countsInput: unknown) => string;

export const getPipelineConversionContext = core.getPipelineConversionContext as (
  rawStatus: unknown
) => PipelineConversionContext;

export const getPipelineSummary = core.getPipelineSummary as (
  countsInput: unknown
) => PipelineSummary;

export const resolvePipelineLeadTarget = core.resolvePipelineLeadTarget as (
  summary: DashboardSummary | null | undefined,
  status: string
) => PipelineLeadTarget | null;

export const inventsPipelineScore = core.inventsPipelineScore as () => boolean;
