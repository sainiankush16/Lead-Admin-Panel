import Constants from "expo-constants";

const PRODUCTION_PUBLIC_HOST = "https://lead-admin-panel.vercel.app";

/**
 * Public API base URL only — never put secrets in Expo public env.
 *
 * Development (simulator): http://localhost:3000
 * Development (physical device): http://<your-mac-lan-ip>:3000
 * Production: https://lead-admin-panel.vercel.app (or EXPO_PUBLIC_API_BASE_URL)
 */
function readExtraString(key: string): string | undefined {
  const extra = Constants.expoConfig?.extra as Record<string, unknown> | undefined;
  const value = extra?.[key];
  return typeof value === "string" ? value : undefined;
}

function isLocalDevHost(url: string): boolean {
  return /localhost|127\.0\.0\.1|192\.168\.|10\.\d+\.|172\.(1[6-9]|2\d|3[0-1])\./i.test(url);
}

export function getApiBaseUrl(): string {
  const fromEnv = process.env.EXPO_PUBLIC_API_BASE_URL?.trim();
  if (fromEnv) return fromEnv.replace(/\/$/, "");

  const fromExtra = readExtraString("apiBaseUrl")?.trim();
  if (fromExtra) return fromExtra.replace(/\/$/, "");

  // Local backend default only while developing.
  if (typeof __DEV__ !== "undefined" && __DEV__) {
    return "http://localhost:3000";
  }

  // Release/store builds must not fall back to localhost.
  return PRODUCTION_PUBLIC_HOST;
}

/**
 * Public legal pages base URL (Privacy Policy / Terms of Use).
 * Separate from authentication semantics; may match the API host in production.
 *
 * Prefer EXPO_PUBLIC_LEGAL_BASE_URL, then API base URL, then the known production host.
 */
export function getLegalBaseUrl(): string {
  const fromEnv = process.env.EXPO_PUBLIC_LEGAL_BASE_URL?.trim();
  if (fromEnv) return fromEnv.replace(/\/$/, "");

  const fromExtra = readExtraString("legalBaseUrl")?.trim();
  if (fromExtra) return fromExtra.replace(/\/$/, "");

  const apiBase = getApiBaseUrl();
  if (apiBase && !isLocalDevHost(apiBase)) {
    return apiBase.replace(/\/$/, "");
  }

  return PRODUCTION_PUBLIC_HOST;
}

export const API_CONFIG = {
  get baseUrl() {
    return getApiBaseUrl();
  },
  get legalBaseUrl() {
    return getLegalBaseUrl();
  }
} as const;
