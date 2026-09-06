import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View
} from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";

import { colors } from "@/constants/theme";
import { useAuth } from "@/hooks/useAuth";
import { useMountedRef } from "@/hooks/useMountedRef";
import { api, ApiClientError } from "@/services/api";
import type { Project } from "@/types";

export default function ProjectsScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const mountedRef = useMountedRef();
  const isAdmin = user?.role === "admin";

  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const emptyMessage = useMemo(
    () => (isAdmin ? "No projects yet. Add a project to get started." : "No projects assigned."),
    [isAdmin]
  );

  const load = useCallback(async (mode: "initial" | "refresh" = "initial") => {
    if (mode === "refresh") setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const result = await api.getProjects();
      if (!mountedRef.current) return;
      setProjects(Array.isArray(result.projects) ? result.projects : []);
    } catch (err) {
      if (!mountedRef.current) return;
      if (err instanceof ApiClientError && err.status === 401) {
        setError("Your session has expired.");
      } else if (err instanceof TypeError) {
        setError("Please check your internet connection.");
      } else {
        setError(err instanceof Error ? err.message : "Unable to load projects.");
      }
      if (mode === "initial") setProjects([]);
    } finally {
      if (mountedRef.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [mountedRef]);

  useEffect(() => {
    void load("initial");
  }, [load]);

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.header}>
        <View style={styles.headerText}>
          <Text style={styles.title}>Projects</Text>
          <Text style={styles.subtitle}>Select a project to view leads</Text>
        </View>
        {isAdmin ? (
          <Pressable
            style={styles.addBtn}
            accessibilityRole="button"
            accessibilityLabel="Add Project"
            onPress={() => router.push("/projects/new")}
          >
            <Text style={styles.addBtnText}>+ Add Project</Text>
          </Pressable>
        ) : null}
      </View>

      {loading && !projects.length ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.accent} size="large" />
          <Text style={styles.centerText}>Loading projects...</Text>
        </View>
      ) : null}

      {error && !loading ? (
        <View style={styles.center}>
          <Text style={styles.error}>{error}</Text>
          <Pressable
            style={styles.retry}
            accessibilityRole="button"
            accessibilityLabel="Retry loading projects"
            onPress={() => {
              void load("initial");
            }}
          >
            <Text style={styles.retryText}>Retry</Text>
          </Pressable>
        </View>
      ) : null}

      {!loading && !error && projects.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.centerText}>{emptyMessage}</Text>
        </View>
      ) : null}

      <FlatList
        data={projects}
        keyExtractor={item => String(item.id)}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              void load("refresh");
            }}
            tintColor={colors.accent}
          />
        }
        renderItem={({ item }) => (
          <View style={styles.card}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Open project ${item.name}`}
              onPress={() => {
                router.push(`/projects/${item.id}`);
              }}
            >
              <Text style={styles.cardTitle}>{item.name}</Text>
              {item.spreadsheetName ? (
                <Text style={styles.meta}>{item.spreadsheetName}</Text>
              ) : null}
              {item.lastSync ? (
                <Text style={styles.meta}>Last sync: {new Date(item.lastSync).toLocaleString()}</Text>
              ) : (
                <Text style={styles.meta}>Tap to View Leads</Text>
              )}
            </Pressable>
            {isAdmin ? (
              <Pressable
                style={styles.configLink}
                accessibilityRole="button"
                accessibilityLabel={`Configure project ${item.name}`}
                onPress={() => router.push(`/projects/${item.id}/config`)}
              >
                <Text style={styles.configText}>Configuration</Text>
              </Pressable>
            ) : null}
          </View>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 8,
    gap: 12
  },
  headerText: { gap: 4 },
  title: { color: colors.text, fontSize: 28, fontWeight: "800" },
  subtitle: { color: colors.textMuted, fontSize: 14 },
  addBtn: {
    alignSelf: "flex-start",
    backgroundColor: colors.accent,
    borderRadius: 10,
    minHeight: 44,
    paddingHorizontal: 14,
    justifyContent: "center"
  },
  addBtnText: { color: colors.bg, fontWeight: "800" },
  list: { paddingHorizontal: 20, paddingBottom: 32 },
  card: {
    borderWidth: 1,
    borderColor: colors.cardBorder,
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12
  },
  cardTitle: { color: colors.text, fontSize: 18, fontWeight: "800" },
  meta: { marginTop: 6, color: colors.textMuted, fontSize: 13 },
  configLink: { marginTop: 12, minHeight: 36, justifyContent: "center" },
  configText: { color: colors.accent, fontWeight: "700" },
  center: { padding: 24, alignItems: "center", gap: 12 },
  centerText: { color: colors.textMuted, textAlign: "center" },
  error: { color: colors.danger, textAlign: "center" },
  retry: {
    backgroundColor: colors.accent,
    borderRadius: 10,
    minHeight: 44,
    paddingHorizontal: 16,
    justifyContent: "center"
  },
  retryText: { color: colors.bg, fontWeight: "700" }
});
