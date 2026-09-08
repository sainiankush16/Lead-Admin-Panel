import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Keyboard,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";

import { LeadSearchResultCard } from "@/components/LeadSearchResultCard";
import { LEAD_STATUSES } from "@/constants/leadStatus";
import { colors } from "@/constants/theme";
import { useMountedRef } from "@/hooks/useMountedRef";
import { api, ApiClientError } from "@/services/api";
import type { Project } from "@/types";
import {
  ALL_PROJECTS,
  ALL_STATUSES,
  applySearchFilters,
  applySuccessfulSearch,
  areSearchFiltersActive,
  canSubmitSearch,
  clearSearchFilters,
  clearSearchState,
  createInitialSearchState,
  formatSearchResultCount,
  mapSearchError,
  MAX_QUERY_LENGTH,
  partialSheetErrorMessage,
  validateSearchDraft,
  type MappedSearchResult,
  type SearchUiState
} from "@/utils/globalSearch";

const STATUS_FILTERS = [ALL_STATUSES, ...LEAD_STATUSES, "Unknown"] as const;

export default function SearchScreen() {
  const router = useRouter();
  const mountedRef = useMountedRef();
  const [state, setState] = useState<SearchUiState>(createInitialSearchState());
  const [localValidation, setLocalValidation] = useState<string | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectsError, setProjectsError] = useState<string | null>(null);

  const submitEnabled = canSubmitSearch({ query: state.query, searching: state.searching });
  const filtersActive = areSearchFiltersActive(state);

  const loadProjects = useCallback(async () => {
    try {
      const response = await api.getProjects();
      if (!mountedRef.current) return;
      setProjects(Array.isArray(response.projects) ? response.projects : []);
      setProjectsError(null);
    } catch (err) {
      if (!mountedRef.current) return;
      if (err instanceof ApiClientError && err.status === 401) {
        setProjectsError("Session expired. Please login again.");
      } else {
        setProjectsError("Unable to load projects for filtering.");
      }
      setProjects([]);
    }
  }, [mountedRef]);

  useEffect(() => {
    void loadProjects();
  }, [loadProjects]);

  async function runSearch() {
    const validated = validateSearchDraft(state.query);
    if (!validated.ok) {
      setLocalValidation(validated.error);
      return;
    }
    if (state.searching) return;

    Keyboard.dismiss();
    setLocalValidation(null);
    setState(prev => ({
      ...prev,
      searching: true,
      error: null,
      partialErrors: false
    }));

    try {
      const response = await api.searchLeads(validated.value);
      if (!mountedRef.current) return;
      setState(prev => applySuccessfulSearch(prev, response, validated.value));
    } catch (err) {
      if (!mountedRef.current) return;
      const mapped = mapSearchError(err instanceof ApiClientError || err instanceof TypeError ? err : null);
      setState(prev => ({
        ...prev,
        searching: false,
        error: mapped.message,
        allResults: [],
        results: [],
        count: 0,
        hasSearched: true,
        partialErrors: false
      }));
    }
  }

  function onClearQuery() {
    setLocalValidation(null);
    setState(prev => ({
      ...clearSearchState(),
      projectFilter: prev.projectFilter,
      statusFilter: prev.statusFilter
    }));
  }

  function onClearFilters() {
    setState(prev => clearSearchFilters(prev));
  }

  function setProjectFilter(projectFilter: "all" | number) {
    setState(prev => applySearchFilters(prev, { projectFilter }));
  }

  function setStatusFilter(statusFilter: string) {
    setState(prev => applySearchFilters(prev, { statusFilter }));
  }

  function openLead(item: MappedSearchResult) {
    if (!Number.isSafeInteger(item.projectId) || item.projectId <= 0) return;
    if (!Number.isSafeInteger(item.rowNumber) || item.rowNumber < 2) return;
    router.push({
      pathname: "/projects/[projectId]/lead/[rowNumber]",
      params: { projectId: item.projectId, rowNumber: item.rowNumber }
    });
  }

  const selectedProjectLabel =
    state.projectFilter === ALL_PROJECTS
      ? "All Projects"
      : projects.find(p => p.id === state.projectFilter)?.name || `Project ${state.projectFilter}`;
  const selectedStatusLabel =
    state.statusFilter === ALL_STATUSES ? "All Statuses" : String(state.statusFilter);

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.header}>
        <Text style={styles.title}>Search</Text>
        <Text style={styles.subtitle}>Search leads across your authorized projects</Text>

        <View style={styles.searchRow}>
          <TextInput
            style={styles.input}
            value={state.query}
            onChangeText={text => {
              setState(prev => ({ ...prev, query: text }));
              setLocalValidation(null);
            }}
            placeholder="Search leads..."
            placeholderTextColor={colors.textMuted}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
            maxLength={MAX_QUERY_LENGTH}
            editable={!state.searching}
            accessibilityLabel="Search leads by name, phone, or email"
            onSubmitEditing={() => {
              void runSearch();
            }}
          />
          {state.query.length > 0 ? (
            <Pressable
              style={styles.clearBtn}
              accessibilityRole="button"
              accessibilityLabel="Clear search query"
              disabled={state.searching}
              onPress={onClearQuery}
            >
              <Text style={styles.clearText}>Clear</Text>
            </Pressable>
          ) : null}
        </View>

        <Pressable
          style={[styles.searchBtn, !submitEnabled && styles.disabled]}
          disabled={!submitEnabled}
          accessibilityRole="button"
          accessibilityLabel="Search leads"
          accessibilityState={{ disabled: !submitEnabled, busy: state.searching }}
          onPress={() => {
            void runSearch();
          }}
        >
          {state.searching ? (
            <View style={styles.searchingRow}>
              <ActivityIndicator color={colors.bg} />
              <Text style={styles.searchBtnText}>Searching...</Text>
            </View>
          ) : (
            <Text style={styles.searchBtnText}>Search</Text>
          )}
        </Pressable>

        <Text style={styles.filterLabel}>Project: {selectedProjectLabel}</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterRow}
        >
          <Pressable
            style={[styles.chip, state.projectFilter === ALL_PROJECTS && styles.chipActive]}
            accessibilityRole="button"
            accessibilityState={{ selected: state.projectFilter === ALL_PROJECTS }}
            accessibilityLabel="Filter All Projects"
            onPress={() => setProjectFilter(ALL_PROJECTS)}
          >
            <Text
              style={[
                styles.chipText,
                state.projectFilter === ALL_PROJECTS && styles.chipTextActive
              ]}
            >
              All Projects
            </Text>
          </Pressable>
          {projects.map(project => {
            const active = state.projectFilter === project.id;
            return (
              <Pressable
                key={project.id}
                style={[styles.chip, active && styles.chipActive]}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                accessibilityLabel={`Filter project ${project.name}`}
                onPress={() => setProjectFilter(project.id)}
              >
                <Text style={[styles.chipText, active && styles.chipTextActive]}>{project.name}</Text>
              </Pressable>
            );
          })}
        </ScrollView>

        <Text style={styles.filterLabel}>Status: {selectedStatusLabel}</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterRow}
        >
          {STATUS_FILTERS.map(option => {
            const value = option === ALL_STATUSES ? ALL_STATUSES : option;
            const label = option === ALL_STATUSES ? "All Statuses" : option;
            const active = state.statusFilter === value;
            return (
              <Pressable
                key={label}
                style={[styles.chip, active && styles.chipActive]}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                accessibilityLabel={`Filter status ${label}`}
                onPress={() => setStatusFilter(value)}
              >
                <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {filtersActive ? (
          <Pressable
            style={styles.clearFilters}
            accessibilityRole="button"
            accessibilityLabel="Clear filters"
            onPress={onClearFilters}
          >
            <Text style={styles.clearFiltersText}>Clear Filters</Text>
          </Pressable>
        ) : null}

        {projectsError ? <Text style={styles.error}>{projectsError}</Text> : null}
        {localValidation ? <Text style={styles.error}>{localValidation}</Text> : null}
        {state.error ? (
          <View style={styles.errorBlock}>
            <Text style={styles.error}>{state.error}</Text>
            <Pressable
              style={styles.retryBtn}
              accessibilityRole="button"
              accessibilityLabel="Retry search"
              onPress={() => {
                void runSearch();
              }}
            >
              <Text style={styles.retryText}>Retry</Text>
            </Pressable>
          </View>
        ) : null}
      </View>

      {state.searching ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.accent} size="large" />
          <Text style={styles.muted}>Searching leads...</Text>
        </View>
      ) : null}

      {!state.searching && !state.hasSearched ? (
        <View style={styles.center}>
          <Text style={styles.muted}>
            Search your leads by name, phone, email, or other lead information. Then filter by
            project or Lead Status.
          </Text>
        </View>
      ) : null}

      {!state.searching && state.hasSearched && !state.error ? (
        <FlatList
          data={state.results}
          keyExtractor={item => `${item.projectId}-${item.rowNumber}`}
          contentContainerStyle={styles.list}
          keyboardShouldPersistTaps="handled"
          ListHeaderComponent={
            <View style={styles.listHeader}>
              <Text style={styles.count}>{formatSearchResultCount(state.count)}</Text>
              {state.partialErrors ? (
                <Text style={styles.partial}>{partialSheetErrorMessage()}</Text>
              ) : null}
              {state.count === 0 ? (
                <Text style={styles.muted}>
                  Try a different name, phone number, email, keyword, or filter.
                </Text>
              ) : null}
            </View>
          }
          renderItem={({ item }) => (
            <LeadSearchResultCard item={item} onPress={() => openLead(item)} />
          )}
        />
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 8 },
  title: { color: colors.text, fontSize: 28, fontWeight: "800" },
  subtitle: { marginTop: 6, marginBottom: 16, color: colors.textMuted, fontSize: 14 },
  searchRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  input: {
    flex: 1,
    minHeight: 48,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    backgroundColor: colors.card,
    color: colors.text,
    paddingHorizontal: 14,
    fontSize: 16
  },
  clearBtn: {
    minHeight: 44,
    justifyContent: "center",
    paddingHorizontal: 4
  },
  clearText: { color: colors.accent, fontWeight: "700" },
  searchBtn: {
    marginTop: 12,
    backgroundColor: colors.accent,
    borderRadius: 10,
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center"
  },
  searchBtnText: { color: colors.bg, fontWeight: "800", fontSize: 16 },
  searchingRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  disabled: { opacity: 0.4 },
  filterLabel: {
    marginTop: 14,
    marginBottom: 8,
    color: colors.textSoft,
    fontSize: 13,
    fontWeight: "700"
  },
  filterRow: { gap: 8, paddingBottom: 4 },
  chip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    paddingHorizontal: 12,
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
  error: { marginTop: 10, color: colors.danger, fontSize: 13 },
  errorBlock: { marginTop: 4, gap: 8 },
  retryBtn: {
    alignSelf: "flex-start",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    paddingHorizontal: 12,
    minHeight: 36,
    justifyContent: "center",
    backgroundColor: colors.card
  },
  retryText: { color: colors.textSoft, fontWeight: "700" },
  center: { flex: 1, paddingHorizontal: 24, justifyContent: "center", alignItems: "center" },
  muted: { color: colors.textMuted, fontSize: 15, textAlign: "center", lineHeight: 22 },
  list: { paddingHorizontal: 20, paddingBottom: 32 },
  listHeader: { marginBottom: 12, gap: 6 },
  count: { color: colors.text, fontWeight: "700", fontSize: 15 },
  partial: { color: colors.danger, fontSize: 13 }
});
