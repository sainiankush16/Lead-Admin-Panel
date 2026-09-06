// Shared pure logic (also covered by Node tests).
// eslint-disable-next-line @typescript-eslint/no-require-imports
const core = require("./leadContactActivityCore.js") as {
  CONTACT_QUICK_REMARKS: readonly string[];
  resolveContactActionUrls: (input?: {
    phone?: string | null;
    email?: string | null;
  }) => {
    telHref: string | null;
    waHref: string | null;
    mailtoHref: string | null;
  };
  contactActionAvailability: (urls: {
    telHref?: string | null;
    waHref?: string | null;
    mailtoHref?: string | null;
  }) => {
    canCall: boolean;
    canWhatsApp: boolean;
    canEmail: boolean;
    telHref: string | null;
    waHref: string | null;
    mailtoHref: string | null;
  };
  contactQuickRemarkSuggestions: () => string[];
  applyContactQuickRemark: (suggestion: string, currentDraft?: string) => string;
  validateContactRemarkDraft: (value: string) =>
    | { ok: true; value: string }
    | { ok: false; error: string };
  canSubmitContactRemark: (input: { draft: string; busy: boolean }) => boolean;
  mapContactRemarkError: (err: unknown) => { message: string; clearAuth: boolean };
  contactRemarkSuccessMessage: () => string;
};

export const CONTACT_QUICK_REMARKS = core.CONTACT_QUICK_REMARKS;
export const resolveContactActionUrls = core.resolveContactActionUrls;
export const contactActionAvailability = core.contactActionAvailability;
export const contactQuickRemarkSuggestions = core.contactQuickRemarkSuggestions;
export const applyContactQuickRemark = core.applyContactQuickRemark;
export const validateContactRemarkDraft = core.validateContactRemarkDraft;
export const canSubmitContactRemark = core.canSubmitContactRemark;
export const mapContactRemarkError = core.mapContactRemarkError;
export const contactRemarkSuccessMessage = core.contactRemarkSuccessMessage;
