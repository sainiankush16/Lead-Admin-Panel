import * as SecureStore from "expo-secure-store";

const SESSION_TOKEN_KEY = "website_crm_mobile_session_token";
const SESSION_EXPIRES_KEY = "website_crm_mobile_session_expires_at";

export async function saveSessionToken(token: string, expiresAt?: string | null) {
  await SecureStore.setItemAsync(SESSION_TOKEN_KEY, token);
  if (expiresAt) {
    await SecureStore.setItemAsync(SESSION_EXPIRES_KEY, expiresAt);
  } else {
    await SecureStore.deleteItemAsync(SESSION_EXPIRES_KEY).catch(() => undefined);
  }
}

export async function getSessionToken(): Promise<string | null> {
  return SecureStore.getItemAsync(SESSION_TOKEN_KEY);
}

export async function getSessionExpiresAt(): Promise<string | null> {
  return SecureStore.getItemAsync(SESSION_EXPIRES_KEY);
}

export async function clearSessionToken() {
  await SecureStore.deleteItemAsync(SESSION_TOKEN_KEY).catch(() => undefined);
  await SecureStore.deleteItemAsync(SESSION_EXPIRES_KEY).catch(() => undefined);
}
