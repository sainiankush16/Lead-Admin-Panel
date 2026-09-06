import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View
} from "react-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";

import { LeadCard } from "@/components/LeadCard";
import { LEAD_STATUSES } from "@/constants/leadStatus";
import { colors } from "@/constants/theme";
import { api, ApiClientError } from "@/services/api";
import { buildLeadListItems, filterLeadListItems, type LeadListItem } from "@/utils/leadList";

const STATUS_FILTERS = ["All", ...LEAD_STATUSES, "Unknown"] as const;

export default function ProjectLeadsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ projectId: string }>();
  const projectId = Number(params.projectId);

  const [projectName, setProjectName] = useState("Project");
  const [items, setItems] = useState<LeadListItem[]>([]);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<string>("All");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);

  const load = useCallback(async (mode: "initial" | "refresh" = "initial") => {
    if (!Number.isSafeInteger(projectId) || projectId <= 0) {
      setError("Project or leads not found.");
      setLoading(false);
      return;
    }
    if (mode === "refresh") setRefreshing(true);
    else setLoading(true);
    setError(null);
    setForbidden(false);
    try {
      const data = await api.getProjectLeads(projectId);
      setProjectName(data.name || "Project");
      setItems(buildLeadListItems(data));
    } catch (err) {
      if (err instanceof ApiClientError && err.status === 401) {
        setError("Your session has expired.");
      } else if (err instanceof ApiClientError && err.status === 403) {
        setForbidden(true);
        setError("You don't have access to this project.");
      } else if (err instanceof ApiClientError && err.status === 404) {
        setError("Project or leads not found.");
      } else if (err instanceof TypeError) {
        setError("Please check your internet connection.");
      } else {
        setError("Unable to load leads.");
      }
      if (mode === "initial") setItems([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [projectId]);

  useEffect(() => {
    void load("initial");
  }, [load]);

  const filtered = useMemo(
    () => filterLeadListItems(items, { query, status }),
    [items, query, status]
  );

  const filtersActive = Boolean(query.trim()) || (status && status !== "All");

  return (
    <SafeAreaView style={styles.safe} edges={["bottom"]}>
      <Stack.Screen options={{ title: projectName }} />

      <View style={styles.header}>
        <Text style={styles.projectTitle}>{projectName}</Text>
        <Text style={styles.count}>
          {filtersActive
            ? `${filtered.length} of ${items.length} leads`
            : `${items.length} ${items.length === 1 ? "Lead" : "Leads"}`}
        </Text>

        <TextInput
          style={styles.search}
          value={query}
          onChangeText={setQuery}
          placeholder="🔍 Search by name, phone or email"
          placeholderTextColor={colors.textMuted}
          autoCapitalize="none"
          autoCorrect={false}
          clearButtonMode="while-editing"
        />

        <View style={styles.filterRow}>
          {STATUS_FILTERS.map(option => {
            const active = status === option;
            return (
              <Pressable
                key={option}
                style={[styles.chip, active && styles.chipActive]}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                accessibilityLabel={`Filter ${option}`}
                onPress={() => setStatus(option)}
              >
                <Text style={[styles.chipText, active && styles.chipTextActive]}>{option}</Text>
              </Pressable>
            );
          })}
        </View>

        {filtersActive ? (
          <Pressable
            style={styles.clearFilters}
            accessibilityRole="button"
            accessibilityLabel="Clear filters"
            onPress={() => {
              setQuery("");
              setStatus("All");
            }}
          >
            <Text style={styles.clearFiltersText}>Clear Filters</Text>
          </Pressable>
        ) : null}
      </View>

      {loading && !items.length ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.accent} size="large" />
          <Text style={styles.centerText}>Loading leads...</Text>
        </View>
      ) : null}

      {error && !loading ? (
        <View style={styles.center}>
          <Text style={styles.error}>{error}</Text>
          {forbidden ? (
            <Pressable
              style={styles.retry}
              onPress={() => router.replace("/projects")}
              accessibilityRole="button"
              accessibilityLabel="Back to projects"
            >
              <Text style={styles.retryText}>Back to Projects</Text>
            </Pressable>
          ) : (
            <Pressable
              style={styles.retry}
              onPress={() => {
                void load("initial");
              }}
              accessibilityRole="button"
              accessibilityLabel="Retry loading leads"
            >
              <Text style={styles.retryText}>Retry</Text>
            </Pressable>
          )}
        </View>
      ) : null}

      {!loading && !error && items.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.centerText}>No leads found for this project.</Text>
          <Pressable
            style={styles.retry}
            onPress={() => {
              void load("refresh");
            }}
          >
            <Text style={styles.retryText}>Refresh</Text>
          </Pressable>
        </View>
      ) : null}

      {!loading && !error && items.length > 0 && filtered.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.centerText}>No leads found.</Text>
        </View>
      ) : null}

      <FlatList
        data={filtered}
        keyExtractor={item => item.leadId}
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
          <LeadCard
            item={item}
            onPress={() => {
              router.push(`/projects/${projectId}/lead/${item.rowNumber}`);
            }}
          />
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 8 },
  projectTitle: { color: colors.text, fontSize: 22, fontWeight: "700" },
  count: { marginTop: 4, marginBottom: 12, color: colors.textMuted, fontSize: 14 },
  search: {
    borderWidth: 1,
    borderColor: colors.cardBorder,
    backgroundColor: colors.card,
    color: colors.text,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 16,
    marginBottom: 10
  },
  filterRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
  },
  chip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: colors.card
  },
  chipActive: {
    backgroundColor: colors.accent,
    borderColor: colors.accent
  },
  chipText: { color: colors.textSoft, fontSize: 12, fontWeight: "600" },
  chipTextActive: { color: colors.bg },
  clearFilters: { marginTop: 10, alignSelf: "flex-start" },
  clearFiltersText: { color: colors.accent, fontWeight: "700", fontSize: 13 },
  list: { paddingHorizontal: 16, paddingBottom: 28 },
  center: { alignItems: "center", marginTop: 36, gap: 12, paddingHorizontal: 24 },
  centerText: { color: colors.textMuted, textAlign: "center", fontSize: 15 },
  error: { color: colors.danger, textAlign: "center", fontSize: 15 },
  retry: {
    backgroundColor: colors.accent,
    borderRadius: 10,
    paddingHorizontal: 18,
    paddingVertical: 12,
    minHeight: 44,
    justifyContent: "center"
  },
  retryText: { color: colors.bg, fontWeight: "700" }
});
