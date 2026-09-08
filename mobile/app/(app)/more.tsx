import { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View
} from "react-native";
import Constants from "expo-constants";
import { SafeAreaView } from "react-native-safe-area-context";

import { BRAND_NAME, BRAND_TAGLINE } from "@/constants/branding";
import { colors } from "@/constants/theme";
import { ActionButton } from "@/components/ui/ActionButton";
import { AppIcon } from "@/components/ui/AppIcon";
import { useAuth } from "@/hooks/useAuth";
import { useMountedRef } from "@/hooks/useMountedRef";
import { getLegalBaseUrl } from "@/lib/config";
import { api, ApiClientError } from "@/services/api";
import {
  configuredLegalLinks,
  deleteAccountConfirmationCopy,
  logoutConfirmationCopy,
  mapAccountInfo,
  mapAppInfo,
  mapDeleteAccountError,
  afterSuccessfulServerAccountDeletion
} from "@/utils/accountSettings";
import { openExternalUrl } from "@/utils/linking";

function resolveAppVersion() {
  return Constants.expoConfig?.version || Constants.nativeAppVersion || null;
}

function resolveBuildNumber() {
  return (
    Constants.nativeBuildVersion ||
    (Constants.expoConfig?.ios as { buildNumber?: string } | undefined)?.buildNumber ||
    (Constants.expoConfig?.android as { versionCode?: number } | undefined)?.versionCode?.toString() ||
    null
  );
}

export default function MoreScreen() {
  const { user, logout, status } = useAuth();
  const mountedRef = useMountedRef();
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const account = useMemo(() => mapAccountInfo(user), [user]);
  const appInfo = useMemo(
    () =>
      mapAppInfo({
        version: resolveAppVersion(),
        buildNumber: resolveBuildNumber(),
        platform: Platform.OS
      }),
    []
  );
  const legalLinks = useMemo(
    () => configuredLegalLinks({ legalBaseUrl: getLegalBaseUrl() }),
    []
  );

  function confirmLogout() {
    if (busy || deleting) return;
    const copy = logoutConfirmationCopy();
    Alert.alert(copy.title, copy.message, [
      { text: copy.cancel, style: "cancel" },
      {
        text: copy.confirm,
        style: "destructive",
        onPress: () => {
          void runLogout();
        }
      }
    ]);
  }

  async function runLogout() {
    if (busy || deleting) return;
    setBusy(true);
    try {
      await logout();
    } finally {
      if (mountedRef.current) setBusy(false);
    }
  }

  function confirmDeleteAccount() {
    if (busy || deleting) return;
    const copy = deleteAccountConfirmationCopy();
    Alert.alert(copy.title, copy.message, [
      { text: copy.cancel, style: "cancel" },
      {
        text: copy.confirm,
        style: "destructive",
        onPress: () => {
          void runDeleteAccount();
        }
      }
    ]);
  }

  async function runDeleteAccount() {
    if (busy || deleting) return;
    setDeleting(true);
    try {
      await api.deleteAccount();
      // Server delete succeeded → local credentials MUST clear even if this screen unmounted.
      await afterSuccessfulServerAccountDeletion({
        clearLocalCredentials: () => logout(),
        isMounted: () => mountedRef.current,
        onSuccessUi: () => {
          Alert.alert(
            "Account deleted",
            "Your Website CRM account has been permanently deleted."
          );
        }
      });
    } catch (err) {
      if (!mountedRef.current) return;
      const statusCode = err instanceof ApiClientError ? err.status : 0;
      const serverMessage = err instanceof ApiClientError ? err.message : undefined;
      Alert.alert("Unable to delete account", mapDeleteAccountError(statusCode, serverMessage));
    } finally {
      if (mountedRef.current) setDeleting(false);
    }
  }

  const actionBusy = busy || deleting;

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>More</Text>

        <Text style={styles.section}>Account</Text>
        {status === "loading" && !user ? (
          <View style={styles.loadingRow}>
            <ActivityIndicator color={colors.accent} />
            <Text style={styles.muted}>Loading account...</Text>
          </View>
        ) : (
          <View style={styles.card}>
            <View style={styles.sectionTitleRow}>
              <AppIcon name="account" size={16} color={colors.accent} />
              <Text style={styles.inlineSection}>Profile</Text>
            </View>
            <Text style={styles.label}>Name</Text>
            <Text style={styles.value}>{account.name}</Text>

            <Text style={styles.label}>Login ID</Text>
            <Text style={styles.value}>{account.loginId}</Text>

            <Text style={styles.label}>Role</Text>
            <Text style={styles.value}>{account.roleLabel}</Text>

            {account.statusLabel ? (
              <>
                <Text style={styles.label}>Status</Text>
                <Text style={styles.value}>{account.statusLabel}</Text>
              </>
            ) : null}
          </View>
        )}

        <Text style={styles.section}>App</Text>
        <View style={styles.card}>
          <Text style={styles.brand}>{BRAND_NAME}</Text>
          <Text style={styles.tagline}>{BRAND_TAGLINE} CRM</Text>

          <Text style={styles.label}>Version</Text>
          <Text style={styles.value}>{appInfo.version}</Text>

          {appInfo.buildNumber ? (
            <>
              <Text style={styles.label}>Build</Text>
              <Text style={styles.value}>{appInfo.buildNumber}</Text>
            </>
          ) : null}

          {appInfo.platform ? (
            <>
              <Text style={styles.label}>Platform</Text>
              <Text style={styles.value}>{appInfo.platform}</Text>
            </>
          ) : null}
        </View>

        <Text style={styles.section}>Legal & Privacy</Text>
        <View style={styles.card}>
          {legalLinks.map(link => (
            <Pressable
              key={link.url}
              style={styles.linkRow}
              accessibilityRole="link"
              accessibilityLabel={link.label}
              onPress={() => {
                void openExternalUrl(link.url, "Unable to open link.");
              }}
            >
              <AppIcon name="legal" size={16} color={colors.accent} />
              <Text style={styles.link}>{link.label}</Text>
            </Pressable>
          ))}
        </View>

        <Text style={styles.section}>Account Action</Text>
        <ActionButton
          label="Logout"
          icon="logout"
          variant="primary"
          disabled={actionBusy}
          busy={busy}
          accessibilityLabel="Logout"
          onPress={confirmLogout}
        />

        <ActionButton
          label="Delete Account"
          icon="delete"
          variant="danger"
          disabled={actionBusy}
          busy={deleting}
          accessibilityLabel="Delete Account"
          onPress={confirmDeleteAccount}
          style={styles.deleteBtn}
        />
        <Text style={styles.deleteHint}>
          Permanent. Removes your Website CRM login. Does not delete Google Sheets or shared lead
          rows.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 24, paddingBottom: 40 },
  title: { color: colors.text, fontSize: 28, fontWeight: "800", marginBottom: 18 },
  section: {
    marginTop: 8,
    marginBottom: 10,
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0.6,
    textTransform: "uppercase"
  },
  card: {
    borderWidth: 1,
    borderColor: colors.cardBorder,
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 16,
    marginBottom: 18
  },
  label: {
    marginTop: 10,
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: "700"
  },
  value: {
    marginTop: 4,
    color: colors.text,
    fontSize: 16,
    fontWeight: "600"
  },
  brand: { color: colors.text, fontSize: 18, fontWeight: "800" },
  tagline: { marginTop: 4, marginBottom: 4, color: colors.textSoft, fontSize: 14 },
  muted: { color: colors.textMuted },
  loadingRow: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 18 },
  sectionTitleRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 4 },
  inlineSection: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0.4,
    textTransform: "uppercase"
  },
  linkRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    minHeight: 44
  },
  link: {
    color: colors.accent,
    fontWeight: "700",
    fontSize: 15
  },
  deleteBtn: {
    marginTop: 12
  },
  deleteHint: {
    marginTop: 10,
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 17
  }
});
