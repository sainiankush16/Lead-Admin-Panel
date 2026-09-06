import type { User } from "@/types";

// Shared pure logic (also covered by Node tests).
// eslint-disable-next-line @typescript-eslint/no-require-imports
const core = require("./accountSettingsCore.js") as {
  displayRoleLabel: (role: string | null | undefined) => string;
  displayAccountStatus: (isActive: boolean | null | undefined) => string | null;
  mapAccountInfo: (user: User | null | undefined) => AccountInfoView;
  mapAppInfo: (input?: {
    version?: string | null;
    buildNumber?: string | null;
    platform?: string | null;
  }) => AppInfoView;
  normalizeLegalBaseUrl: (value: string | null | undefined) => string;
  configuredLegalLinks: (config?: {
    legalBaseUrl?: string;
    privacyPolicyUrl?: string;
    termsUrl?: string;
    deleteAccountUrl?: string;
    supportUrl?: string;
  }) => Array<{ label: string; url: string }>;
  accountViewContainsSensitiveFields: (viewModel: unknown) => boolean;
  logoutConfirmationCopy: () => {
    title: string;
    message: string;
    cancel: string;
    confirm: string;
  };
  deleteAccountConfirmationCopy: () => {
    title: string;
    message: string;
    cancel: string;
    confirm: string;
    confirmToken: string;
  };
  mapDeleteAccountError: (status: number | null | undefined, fallbackMessage?: string) => string;
  afterSuccessfulServerAccountDeletion: (input: {
    clearLocalCredentials: () => void | Promise<void>;
    isMounted?: () => boolean;
    onSuccessUi?: () => void | Promise<void>;
  }) => Promise<{ credentialsCleared: true; uiShown: boolean }>;
};

export interface AccountInfoView {
  name: string;
  loginId: string;
  roleLabel: string;
  statusLabel: string | null;
}

export interface AppInfoView {
  productName: string;
  tagline: string;
  version: string;
  buildNumber: string | null;
  platform: string | null;
}

export const displayRoleLabel = core.displayRoleLabel;
export const displayAccountStatus = core.displayAccountStatus;
export const mapAccountInfo = core.mapAccountInfo;
export const mapAppInfo = core.mapAppInfo;
export const normalizeLegalBaseUrl = core.normalizeLegalBaseUrl;
export const configuredLegalLinks = core.configuredLegalLinks;
export const accountViewContainsSensitiveFields = core.accountViewContainsSensitiveFields;
export const logoutConfirmationCopy = core.logoutConfirmationCopy;
export const deleteAccountConfirmationCopy = core.deleteAccountConfirmationCopy;
export const mapDeleteAccountError = core.mapDeleteAccountError;
export const afterSuccessfulServerAccountDeletion = core.afterSuccessfulServerAccountDeletion;
