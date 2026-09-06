import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";

import { LeadCard } from "@/components/LeadCard";
import { LEAD_STATUSES } from "@/constants/leadStatus";
import { colors } from "@/constants/theme";
import { api, ApiClientError } from "@/services/api";
import { normalizeLeadListStatusParam } from "@/utils/dashboardSummary";
import {
  areLeadListFiltersActive,
  buildLeadListItems,
  filterLeadListItems,
  formatLeadListCount,
  leadListDetailHref,
  type LeadListItem
} from "@/utils/leadList";

const STATUS_FILTERS = ["All", ...LEAD_STATUSES, "Unknown"] as const;

export default function ProjectLeadsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ projectId: string; status?: string | string[] }>();
  const projectId = Number(params.projectId);
  const routeStatus = normalizeLeadListStatusParam(params.status);

  const [projectName, setProjectName] = useState("Project");
  const [items, setItems] = useState<LeadListItem[]>([]);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<string>(routeStatus || "All");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const skipNextFocusRefresh = useRef(true);

  useEffect(() => {
    if (routeStatus) {
      setStatus(routeStatus);
    }
  }, [routeStatus]);

  const load = useCallback(async (mode: "initial" | "refresh" | "focus" = "initial") => {
    if (!Number.isSafeInteger(projectId) || projectId <= 0) {
      setError("Project or leads not found.");
      setLoading(false);
      return;
    }
    if (mode === "refresh") setRefreshing(true);
    else if (mode === "initial") setLoading(true);
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

  useFocusEffect(
    useCallback(() => {
      if (skipNextFocusRefresh.current) {
        skipNextFocusRefresh.current = false;
        return;
      }
      // Returning from Lead Detail: refresh server data without resetting filters/scroll.
      void load("focus");
    }, [load])
  );

  const filtered = useMemo(
    () => filterLeadListItems(items, { query, status }),
    [items, query, status]
  );

  const filtersActive = areLeadListFiltersActive({ query, status });
  const countLabel = formatLeadListCount({
    filteredCount: filtered.length,
    totalCount: items.length,
    filtersActive
  });

  function clearStatusFilter() {
    setStatus("All");
    router.setParams({ status: undefined });
  }

  function clearFilters() {
    setQuery("");
    setStatus("All");
    router.setParams({ status: undefined });
  }

  function selectStatus(option: string) {
    setStatus(option);
    if (option === "All") {
      router.setParams({ status: undefined });
      return;
    }
    router.setParams({ status: option });
  }

  function openLead(item: LeadListItem) {
    const href = leadListDetailHref(projectId, item.rowNumber);
    if (!href) return;
    router.push(href);
  }

  return (
    <SafeAreaView style={styles.safe} edges={["bottom"]}>
      <Stack.Screen options={{ title: projectName }} />

      <View style={styles.header}>
        <Text style={styles.projectTitle}>{projectName}</Text>
        <Text style={styles.count} accessibilityLabel={countLabel}>
          {countLabel}
        </Text>

        {status !== "All" ? (
          <View style={styles.activeFilter}>
            <Text style={styles.activeFilterText}>Status: {status}</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Clear status filter"
              onPress={clearStatusFilter}
            >
              <Text style={styles.clearFiltersText}>Clear</Text>
            </Pressable>
          </View>
        ) : null}

        <TextInput
          style={styles.search}
          value={query}
          onChangeText={setQuery}
          placeholder="Search by name, phone or email"
          placeholderTextColor={colors.textMuted}
          autoCapitalize="none"
          autoCorrect={false}
          clearButtonMode="while-editing"
          accessibilityLabel="Search leads in this project"
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
                onPress={() => selectStatus(option)}
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
            onPress={clearFilters}
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
            accessibilityRole="button"
            accessibilityLabel="Refresh leads"
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
          <Text style={styles.centerText}>No matching leads</Text>
          <Pressable
            style={styles.retry}
            accessibilityRole="button"
            accessibilityLabel="Clear filters"
            onPress={clearFilters}
          >
            <Text style={styles.retryText}>Clear Filters</Text>
          </Pressable>
        </View>
      ) : null}

      <FlatList
        data={filtered}
        keyExtractor={item => item.leadId}
        contentContainerStyle={styles.list}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              void load("refresh");
            }}
            tintColor={colors.accent}
          />
        }
        renderItem={({ item }) => <LeadCard item={item} onPress={() => openLead(item)} />}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 8 },
  projectTitle: { color: colors.text, fontSize: 22, fontWeight: "700" },
  count: { marginTop: 4, marginBottom: 12, color: colors.textMuted, fontSize: 14 },
  activeFilter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: colors.card,
    borderColor: colors.accent,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 10
  },
  activeFilterText: { color: colors.text, fontWeight: "700", fontSize: 13 },
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
