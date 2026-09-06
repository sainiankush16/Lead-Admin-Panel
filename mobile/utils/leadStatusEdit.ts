import type { LeadStatusValue } from "@/constants/leadStatus";
import type { LeadDetailModel } from "@/utils/leadDetail";

// Shared pure logic (also covered by Node tests).
// eslint-disable-next-line @typescript-eslint/no-require-imports
const core = require("./leadStatusEditCore.js") as {
  ALLOWED_LEAD_STATUSES: readonly LeadStatusValue[];
  isAllowedLeadStatus: (value: unknown) => boolean;
  initialStatusSelection: (displayStatus: string | null | undefined) => LeadStatusValue | null;
  shouldSubmitStatusChange: (
    displayStatus: string | null | undefined,
    selectedStatus: string | null | undefined
  ) => boolean;
  canEnableSaveStatus: (args: {
    displayStatus: string | null | undefined;
    selectedStatus: string | null | undefined;
    saving: boolean;
  }) => boolean;
  applySuccessfulStatusUpdate: (
    detail: LeadDetailModel | null,
    nextStatus: string
  ) => LeadDetailModel | null;
  mapStatusUpdateError: (err: { status?: number; name?: string } | null | undefined) => {
    message: string;
    clearAuth: boolean;
  };
};

export const ALLOWED_LEAD_STATUSES = core.ALLOWED_LEAD_STATUSES;
export const isAllowedLeadStatus = core.isAllowedLeadStatus;
export const initialStatusSelection = core.initialStatusSelection;
export const shouldSubmitStatusChange = core.shouldSubmitStatusChange;
export const canEnableSaveStatus = core.canEnableSaveStatus;
export const applySuccessfulStatusUpdate = core.applySuccessfulStatusUpdate;
export const mapStatusUpdateError = core.mapStatusUpdateError;
