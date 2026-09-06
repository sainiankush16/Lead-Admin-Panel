/**
 * Lead Status values used by the existing Lead Admin backend.
 * Spelling must remain exact.
 */
export const LEAD_STATUSES = [
  "New",
  "Contacted",
  "Interested",
  "Follow Up",
  "Site Visit",
  "Converted",
  "Not Interested",
  "Lost"
] as const;

export type LeadStatusValue = (typeof LEAD_STATUSES)[number];
