// Shared pure logic (also covered by Node tests).
// eslint-disable-next-line @typescript-eslint/no-require-imports
const core = require("./leadWorkflowCore.js") as {
  WORKFLOW_SECTIONS: readonly string[];
  NEXT_ACTIONS: ReadonlyArray<{ id: string; label: string }>;
  displayLeadIdentityName: (name: unknown) => string;
  displayLeadIdentityPhone: (phone: unknown) => string;
  displayLeadIdentityEmail: (email: unknown) => string;
  displayLeadIdentityStatus: (status: unknown) => string;
  shouldCollapseAdditionalFieldsByDefault: (fieldCount: number) => boolean;
  stickyActionBarRecommended: () => boolean;
};

export const WORKFLOW_SECTIONS = core.WORKFLOW_SECTIONS;
export const NEXT_ACTIONS = core.NEXT_ACTIONS;
export const displayLeadIdentityName = core.displayLeadIdentityName;
export const displayLeadIdentityPhone = core.displayLeadIdentityPhone;
export const displayLeadIdentityEmail = core.displayLeadIdentityEmail;
export const displayLeadIdentityStatus = core.displayLeadIdentityStatus;
export const shouldCollapseAdditionalFieldsByDefault = core.shouldCollapseAdditionalFieldsByDefault;
export const stickyActionBarRecommended = core.stickyActionBarRecommended;
