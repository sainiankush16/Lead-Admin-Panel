import type { LeadStatusValue } from "@/constants/leadStatus";

// Shared pure logic (also covered by Node tests).
// eslint-disable-next-line @typescript-eslint/no-require-imports
const core = require("./leadFollowUpCore.js") as {
  FOLLOW_UP_STATUS: LeadStatusValue;
  isFollowUpStatus: (displayStatus: string | null | undefined) => boolean;
  shouldMarkFollowUp: (displayStatus: string | null | undefined) => boolean;
  canEnableMarkFollowUp: (input: {
    displayStatus: string | null | undefined;
    saving: boolean;
  }) => boolean;
  followUpConfirmationCopy: () => {
    title: string;
    cancel: string;
    confirm: string;
  };
  alreadyFollowUpMessage: () => string;
  followUpSuccessMessage: () => string;
  followUpRemarkSuccessMessage: () => string;
  validateFollowUpRemarkDraft: (value: string) =>
    | { ok: true; value: string }
    | { ok: false; error: string };
  canSubmitFollowUpRemark: (input: { draft: string; busy: boolean }) => boolean;
  mapFollowUpStatusError: (err: unknown) => { message: string; clearAuth: boolean };
  mapFollowUpRemarkError: (err: unknown) => { message: string; clearAuth: boolean };
};

export const FOLLOW_UP_STATUS = core.FOLLOW_UP_STATUS;
export const isFollowUpStatus = core.isFollowUpStatus;
export const shouldMarkFollowUp = core.shouldMarkFollowUp;
export const canEnableMarkFollowUp = core.canEnableMarkFollowUp;
export const followUpConfirmationCopy = core.followUpConfirmationCopy;
export const alreadyFollowUpMessage = core.alreadyFollowUpMessage;
export const followUpSuccessMessage = core.followUpSuccessMessage;
export const followUpRemarkSuccessMessage = core.followUpRemarkSuccessMessage;
export const validateFollowUpRemarkDraft = core.validateFollowUpRemarkDraft;
export const canSubmitFollowUpRemark = core.canSubmitFollowUpRemark;
export const mapFollowUpStatusError = core.mapFollowUpStatusError;
export const mapFollowUpRemarkError = core.mapFollowUpRemarkError;
