import Constants from "expo-constants";

/**
 * Public API base URL only — never put secrets in Expo public env.
 *
 * Development (simulator): http://localhost:3000
 * Development (physical device): http://<your-mac-lan-ip>:3000
 * Production: https://your-deployed-api-host
 */
function readExtraApiBaseUrl(): string | undefined {
  const extra = Constants.expoConfig?.extra as { apiBaseUrl?: string } | undefined;
  return extra?.apiBaseUrl;
}

export function getApiBaseUrl(): string {
  const fromEnv = process.env.EXPO_PUBLIC_API_BASE_URL?.trim();
  if (fromEnv) return fromEnv.replace(/\/$/, "");

  const fromExtra = readExtraApiBaseUrl()?.trim();
  if (fromExtra) return fromExtra.replace(/\/$/, "");

  // Local backend default for Phase 2 scaffolding.
  return "http://localhost:3000";
}

export const API_CONFIG = {
  get baseUrl() {
    return getApiBaseUrl();
  }
} as const;
