import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View
} from "react-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";

import { colors } from "@/constants/theme";
import { useAuth } from "@/hooks/useAuth";
import { api, ApiClientError } from "@/services/api";
import {
  mapProjectConfiguration,
  mapProjectManagementError,
  type ProjectConfiguration
} from "@/utils/projectManagement";

export default function ProjectConfigScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const params = useLocalSearchParams<{ projectId: string }>();
  const projectId = Number(params.projectId);

  const [config, setConfig] = useState<ProjectConfiguration | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (mode: "initial" | "refresh" = "initial") => {
    if (!isAdmin) {
      setError("You don't have permission to manage projects.");
      setLoading(false);
      return;
    }
    if (!Number.isSafeInteger(projectId) || projectId <= 0) {
      setError("Project or spreadsheet not found.");
      setLoading(false);
      return;
    }
    if (mode === "refresh") setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const response = await api.getProjects();
      const project = (response.projects || []).find(item => Number(item.id) === projectId) || null;
      const mapped = mapProjectConfiguration(project);
      if (!mapped) {
        setConfig(null);
        setError("Project or spreadsheet not found.");
        return;
      }
      setConfig(mapped);
    } catch (err) {
      const mapped = mapProjectManagementError(
        err instanceof ApiClientError || err instanceof TypeError ? err : null
      );
      setError(mapped.message);
      if (mode === "initial") setConfig(null);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [isAdmin, projectId]);

  useEffect(() => {
    void load("initial");
  }, [load]);

  if (!isAdmin) {
    return (
      <SafeAreaView style={styles.safe} edges={["bottom"]}>
        <Stack.Screen options={{ title: "Configuration" }} />
        <View style={styles.center}>
          <Text style={styles.error}>You don't have permission to manage projects.</Text>
          <Pressable style={styles.button} onPress={() => router.replace("/projects")}>
            <Text style={styles.buttonText}>Back to Projects</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={["bottom"]}>
      <Stack.Screen options={{ title: config?.name || "Configuration" }} />

      {loading && !config ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.accent} size="large" />
          <Text style={styles.muted}>Loading configuration...</Text>
        </View>
      ) : null}

      {error && !config && !loading ? (
        <View style={styles.center}>
          <Text style={styles.error}>{error}</Text>
          <Pressable
            style={styles.button}
            onPress={() => {
              void load("initial");
            }}
          >
            <Text style={styles.buttonText}>Retry</Text>
          </Pressable>
        </View>
      ) : null}

      {config ? (
        <ScrollView
          contentContainerStyle={styles.content}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                void load("refresh");
              }}
              tintColor={colors.accent}
            />
          }
        >
          <Text style={styles.title}>{config.name}</Text>

          <Text style={styles.label}>Spreadsheet</Text>
          <Text style={styles.value}>{config.spreadsheetName}</Text>

          <Text style={styles.label}>Sheet / Tab</Text>
          <Text style={styles.value}>{config.sheetName}</Text>

          <Text style={styles.label}>Detected headers</Text>
          {config.columns.length === 0 ? (
            <Text style={styles.muted}>No headers detected.</Text>
          ) : (
            config.columns.map((header, index) => (
              <Text key={`${header}-${index}`} style={styles.headerItem}>
                • {header}
              </Text>
            ))
          )}

          <Text style={styles.label}>Header count</Text>
          <Text style={styles.value}>{config.headerCount}</Text>

          {config.lastSync ? (
            <>
              <Text style={styles.label}>Last sync</Text>
              <Text style={styles.value}>{new Date(config.lastSync).toLocaleString()}</Text>
            </>
          ) : null}

          <Pressable
            style={styles.button}
            accessibilityRole="button"
            accessibilityLabel="View leads"
            onPress={() => router.push(`/projects/${config.id}`)}
          >
            <Text style={styles.buttonText}>View Leads</Text>
          </Pressable>

          <Pressable
            style={styles.link}
            accessibilityRole="button"
            accessibilityLabel="Manage user assignments"
            onPress={() => router.push("/users")}
          >
            <Text style={styles.linkText}>Manage user assignments</Text>
          </Pressable>
        </ScrollView>
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 20, paddingBottom: 40 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, padding: 24 },
  title: { color: colors.text, fontSize: 26, fontWeight: "800", marginBottom: 16 },
  label: {
    marginTop: 14,
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase"
  },
  value: { marginTop: 4, color: colors.text, fontSize: 16, fontWeight: "600" },
  headerItem: { marginTop: 6, color: colors.textSoft, fontSize: 14 },
  muted: { color: colors.textMuted, marginTop: 6 },
  error: { color: colors.danger, textAlign: "center" },
  button: {
    marginTop: 24,
    backgroundColor: colors.accent,
    borderRadius: 10,
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center"
  },
  buttonText: { color: colors.bg, fontWeight: "800" },
  link: { marginTop: 16, alignItems: "center" },
  linkText: { color: colors.accent, fontWeight: "700" }
});
