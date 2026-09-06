import type { Remark, TimelineEvent } from "@/types";
import type { PrimaryLeadAction } from "@/utils/leadProductivity";

export interface WorkThisLeadSummary {
  title: string;
  projectName: string;
  currentLabel: string;
  currentValue: string;
  nextLabel: string;
  nextValue: string;
  contactLabel: string;
  contactValue: string;
  activityLabel: string;
  activityValue: string;
  remarksLabel: string;
  remarksValue: string;
  recommendation: string;
  primaryAction: PrimaryLeadAction;
  changesStatus: boolean;
  sendsCommunication: boolean;
  inventsScore: boolean;
}

// eslint-disable-next-line @typescript-eslint/no-require-imports
const core = require("./leadWorkspaceCore.js");

export const buildWorkThisLeadSummary = core.buildWorkThisLeadSummary as (input?: {
  status?: unknown;
  projectName?: string | null;
  telHref?: string | null;
  mailtoHref?: string | null;
  timelineEvents?: TimelineEvent[] | null;
  remarks?: Remark[] | null;
}) => WorkThisLeadSummary;
