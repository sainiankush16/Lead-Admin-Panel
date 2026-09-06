import type { Remark, User } from "@/types";

// Shared pure logic (also covered by Node tests).
// eslint-disable-next-line @typescript-eslint/no-require-imports
const core = require("./leadRemarksCore.js") as {
  MAX_REMARK_LENGTH: number;
  validateRemarkDraft: (value: unknown) => { ok: true; value: string } | { ok: false; error: string };
  canMutateRemark: (user: User | null | undefined, remark: Remark | null | undefined) => boolean;
  remarkAuthorLabel: (remark: Remark | null | undefined) => string;
  formatRemarkTimestamp: (value: string | null | undefined) => string;
  leadIdFromRowNumber: (rowNumber: number | string) => string | null;
  mapRemarksLoadError: (err: { status?: number; name?: string } | null | undefined) => {
    message: string;
    clearAuth: boolean;
  };
  mapRemarkMutationError: (
    err: { status?: number; name?: string; message?: string } | null | undefined,
    action: "add" | "edit" | "delete"
  ) => { message: string; clearAuth: boolean };
  canSubmitRemarkDraft: (args: { draft: string; busy: boolean }) => boolean;
};

export const MAX_REMARK_LENGTH = core.MAX_REMARK_LENGTH;
export const validateRemarkDraft = core.validateRemarkDraft;
export const canMutateRemark = core.canMutateRemark;
export const remarkAuthorLabel = core.remarkAuthorLabel;
export const formatRemarkTimestamp = core.formatRemarkTimestamp;
export const leadIdFromRowNumber = core.leadIdFromRowNumber;
export const mapRemarksLoadError = core.mapRemarksLoadError;
export const mapRemarkMutationError = core.mapRemarkMutationError;
export const canSubmitRemarkDraft = core.canSubmitRemarkDraft;
