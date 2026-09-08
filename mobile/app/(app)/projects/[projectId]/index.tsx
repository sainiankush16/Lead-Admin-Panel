import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
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
import { PipelineSummaryCard } from "@/components/PipelineSummaryCard";
import { LEAD_STATUSES, type LeadStatusValue } from "@/constants/leadStatus";
import { colors } from "@/constants/theme";
import { api, ApiClientError } from "@/services/api";
import { normalizeLeadListStatusParam } from "@/utils/dashboardSummary";
import {
  areLeadListFiltersActive,
  BULK_STATUS_CONCURRENCY,
  buildBulkStatusResult,
  buildLeadListItems,
  bulkStatusConfirmationCopy,
  canEnableBulkStatus,
  clearLeadSelection,
  filterLeadListItems,
  formatBulkStatusProgress,
  formatLeadListCount,
  formatSelectionCount,
  runBulkLeadStatusUpdates,
  selectAllVisibleLeads,
  selectedLeadCount,
  selectionKeyFromRowNumber,
  toggleLeadSelection,
  type BulkStatusResultView,
  type LeadListItem
} from "@/utils/leadList";
import { getPipelineCounts } from "@/utils/pipeline";

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
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(() => clearLeadSelection());
  const [statusPickerOpen, setStatusPickerOpen] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkProgress, setBulkProgress] = useState<string | null>(null);
  const [bulkResult, setBulkResult] = useState<BulkStatusResultView | null>(null);
  const skipNextFocusRefresh = useRef(true);
  const bulkInFlight = useRef(false);
  const mountedRef = useRef(true);
  const filterSnapshot = useRef({ query: "", status: routeStatus || "All" });

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (routeStatus) {
      setStatus(routeStatus);
    }
  }, [routeStatus]);

  const exitSelectionMode = useCallback(() => {
    setSelectionMode(false);
    setSelectedKeys(clearLeadSelection());
    setStatusPickerOpen(false);
  }, []);

  const load = useCallback(
    async (mode: "initial" | "refresh" | "focus" = "initial") => {
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
        if (!mountedRef.current) return;
        setProjectName(data.name || "Project");
        setItems(buildLeadListItems(data));
      } catch (err) {
        if (!mountedRef.current) return;
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
        if (mountedRef.current) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [projectId]
  );

  useEffect(() => {
    void load("initial");
  }, [load]);

  useFocusEffect(
    useCallback(() => {
      if (skipNextFocusRefresh.current) {
        skipNextFocusRefresh.current = false;
      } else {
        void load("focus");
      }
      return () => {
        exitSelectionMode();
        setBulkResult(null);
        setBulkProgress(null);
      };
    }, [load, exitSelectionMode])
  );

  const filtered = useMemo(
    () => filterLeadListItems(items, { query, status }),
    [items, query, status]
  );

  const pipelineCounts = useMemo(() => getPipelineCounts(items), [items]);

  useEffect(() => {
    const prev = filterSnapshot.current;
    if (prev.query !== query || prev.status !== status) {
      filterSnapshot.current = { query, status };
      setSelectedKeys(clearLeadSelection());
      setStatusPickerOpen(false);
      setBulkResult(null);
    }
  }, [query, status]);

  const filtersActive = areLeadListFiltersActive({ query, status });
  const countLabel = formatLeadListCount({
    filteredCount: filtered.length,
    totalCount: items.length,
    filtersActive
  });
  const selectedCount = selectedLeadCount(selectedKeys);
  const selectionLabel = formatSelectionCount(selectedCount);
  const bulkEnabled = canEnableBulkStatus({ selectedCount, busy: bulkBusy });

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
    if (!Number.isSafeInteger(projectId) || projectId <= 0) return;
    if (!Number.isSafeInteger(item.rowNumber) || item.rowNumber < 2) return;
    router.push({
      pathname: "/projects/[projectId]/lead/[rowNumber]",
      params: { projectId, rowNumber: item.rowNumber }
    });
  }

  function onLeadPress(item: LeadListItem) {
    if (selectionMode) {
      if (bulkBusy) return;
      setSelectedKeys(prev => toggleLeadSelection(prev, item.rowNumber));
      setBulkResult(null);
      return;
    }
    openLead(item);
  }

  function enterSelectionMode() {
    setSelectionMode(true);
    setSelectedKeys(clearLeadSelection());
    setStatusPickerOpen(false);
    setBulkResult(null);
  }

  function cancelSelection() {
    if (bulkBusy) return;
    exitSelectionMode();
    setBulkResult(null);
  }

  function selectAllVisible() {
    if (bulkBusy) return;
    setSelectedKeys(selectAllVisibleLeads(filtered));
    setBulkResult(null);
  }

  function clearSelectionOnly() {
    if (bulkBusy) return;
    setSelectedKeys(clearLeadSelection());
    setStatusPickerOpen(false);
    setBulkResult(null);
  }

  function dismissBulkResult() {
    setBulkResult(null);
  }

  function onPullRefresh() {
    if (bulkInFlight.current || bulkBusy) return;
    exitSelectionMode();
    setBulkResult(null);
    void load("refresh");
  }

  function openStatusPicker() {
    if (!bulkEnabled) return;
    setStatusPickerOpen(true);
    setBulkResult(null);
  }

  function chooseBulkStatus(target: LeadStatusValue) {
    if (!bulkEnabled || bulkInFlight.current || bulkBusy) return;
    const copy = bulkStatusConfirmationCopy(selectedCount, target);
    Alert.alert(copy.title, copy.message, [
      { text: copy.cancel, style: "cancel" },
      {
        text: copy.confirm,
        onPress: () => {
          void executeBulkStatus(target);
        }
      }
    ]);
  }

  async function executeBulkStatus(target: LeadStatusValue) {
    if (bulkInFlight.current || selectedCount <= 0) return;
    bulkInFlight.current = true;
    setBulkBusy(true);
    setStatusPickerOpen(false);
    setBulkProgress(formatBulkStatusProgress({ completed: 0, total: selectedCount }));
    setBulkResult(null);

    const rowNumbers = [...selectedKeys]
      .map(key => Number(key))
      .filter(row => Number.isSafeInteger(row) && row >= 2);

    try {
      const summary = await runBulkLeadStatusUpdates({
        projectId,
        rowNumbers,
        status: target,
        concurrency: BULK_STATUS_CONCURRENCY,
        updateLeadStatus: (pid, row, nextStatus) => api.updateLeadStatus(pid, row, nextStatus),
        onProgress: ({ completed, total }) => {
          if (!mountedRef.current) return;
          setBulkProgress(formatBulkStatusProgress({ completed, total }));
        }
      });

      if (mountedRef.current) {
        setBulkResult(buildBulkStatusResult(summary, target));
        exitSelectionMode();
      }

      await load("focus");
    } finally {
      bulkInFlight.current = false;
      if (mountedRef.current) {
        setBulkBusy(false);
        setBulkProgress(null);
      }
    }
  }

  return (
    <SafeAreaView style={styles.safe} edges={["bottom"]}>
      <Stack.Screen options={{ title: projectName }} />

      <View style={styles.header}>
        <Text style={styles.projectTitle}>{projectName}</Text>
        <Text style={styles.count} accessibilityLabel={countLabel}>
          {countLabel}
        </Text>

        {!loading && !error && items.length > 0 ? (
          <PipelineSummaryCard
            title="Pipeline"
            counts={pipelineCounts}
            compact
            showAttention
            showHealth={false}
            onSelectStatus={option => {
              if (bulkBusy) return;
              selectStatus(option);
            }}
          />
        ) : null}

        {status !== "All" ? (
          <View style={styles.activeFilter}>
            <Text style={styles.activeFilterText}>Status: {status}</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Clear status filter"
              disabled={bulkBusy}
              onPress={clearStatusFilter}
            >
              <Text style={styles.clearFiltersText}>Clear</Text>
            </Pressable>
          </View>
        ) : null}

        <TextInput
          style={styles.search}
          value={query}
          onChangeText={text => {
            if (bulkBusy) return;
            setQuery(text);
          }}
          editable={!bulkBusy}
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
                accessibilityState={{ selected: active, disabled: bulkBusy }}
                accessibilityLabel={`Filter ${option}`}
                disabled={bulkBusy}
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
            disabled={bulkBusy}
            onPress={clearFilters}
          >
            <Text style={styles.clearFiltersText}>Clear Filters</Text>
          </Pressable>
        ) : null}

        <View style={styles.selectionBar}>
          {!selectionMode ? (
            <Pressable
              style={styles.selectionBtn}
              accessibilityRole="button"
              accessibilityLabel="Select leads"
              disabled={bulkBusy || filtered.length === 0}
              onPress={enterSelectionMode}
            >
              <Text style={styles.selectionBtnText}>Select</Text>
            </Pressable>
          ) : (
            <>
              <Pressable
                style={styles.selectionBtn}
                accessibilityRole="button"
                accessibilityLabel="Cancel selection"
                disabled={bulkBusy}
                onPress={cancelSelection}
              >
                <Text style={styles.selectionBtnText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={styles.selectionBtn}
                accessibilityRole="button"
                accessibilityLabel="Select all visible leads"
                disabled={bulkBusy || filtered.length === 0}
                onPress={selectAllVisible}
              >
                <Text style={styles.selectionBtnText}>Select All</Text>
              </Pressable>
              <Pressable
                style={styles.selectionBtn}
                accessibilityRole="button"
                accessibilityLabel="Clear selection"
                disabled={bulkBusy || selectedCount === 0}
                onPress={clearSelectionOnly}
              >
                <Text style={styles.selectionBtnText}>Clear Selection</Text>
              </Pressable>
            </>
          )}
        </View>

        {selectionMode ? (
          <View style={styles.bulkBar}>
            <Text style={styles.selectionCount} accessibilityLabel={selectionLabel}>
              {selectionLabel}
            </Text>
            <Pressable
              style={[styles.bulkStatusBtn, !bulkEnabled && styles.bulkStatusDisabled]}
              accessibilityRole="button"
              accessibilityLabel="Bulk status update"
              accessibilityState={{ disabled: !bulkEnabled }}
              disabled={!bulkEnabled}
              onPress={openStatusPicker}
            >
              <Text style={styles.bulkStatusText}>Bulk Status</Text>
            </Pressable>
          </View>
        ) : null}

        {statusPickerOpen && selectionMode ? (
          <View style={styles.statusPicker} accessibilityLabel="Choose bulk lead status">
            <Text style={styles.statusPickerTitle}>Choose status</Text>
            <View style={styles.filterRow}>
              {LEAD_STATUSES.map(option => (
                <Pressable
                  key={option}
                  style={styles.chip}
                  accessibilityRole="button"
                  accessibilityLabel={`Set status ${option}`}
                  disabled={bulkBusy}
                  onPress={() => chooseBulkStatus(option)}
                >
                  <Text style={styles.chipText}>{option}</Text>
                </Pressable>
              ))}
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close status picker"
              disabled={bulkBusy}
              onPress={() => setStatusPickerOpen(false)}
            >
              <Text style={styles.clearFiltersText}>Close</Text>
            </Pressable>
          </View>
        ) : null}

        {bulkProgress ? (
          <Text style={styles.bulkProgress} accessibilityLabel={bulkProgress}>
            {bulkProgress}
          </Text>
        ) : null}

        {bulkResult ? (
          <View
            style={[
              styles.resultCard,
              bulkResult.kind === "failure" && styles.resultCardFailure,
              bulkResult.kind === "partial" && styles.resultCardPartial,
              bulkResult.kind === "success" && styles.resultCardSuccess
            ]}
            accessibilityRole="summary"
            accessibilityLabel={bulkResult.accessibilityLabel}
          >
            <Text style={styles.resultTitle}>Bulk Status Result</Text>
            <Text
              style={[
                styles.resultHeadline,
                bulkResult.kind === "failure" && styles.resultHeadlineFailure
              ]}
            >
              {bulkResult.headline}
            </Text>
            {bulkResult.details.map(line => (
              <Text key={line} style={styles.resultDetail}>
                {line}
              </Text>
            ))}
            <Text style={styles.resultTargetLabel}>Target Status</Text>
            <Text style={styles.resultTargetValue}>{bulkResult.targetStatus}</Text>
            {bulkResult.retryHint ? (
              <Text style={styles.resultRetryHint}>{bulkResult.retryHint}</Text>
            ) : null}
            <Pressable
              style={styles.resultDismiss}
              accessibilityRole="button"
              accessibilityLabel="Dismiss bulk result"
              onPress={dismissBulkResult}
            >
              <Text style={styles.resultDismissText}>Dismiss</Text>
            </Pressable>
          </View>
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
            onRefresh={onPullRefresh}
            tintColor={colors.accent}
          />
        }
        renderItem={({ item }) => {
          const key = selectionKeyFromRowNumber(item.rowNumber);
          const selected = Boolean(key && selectedKeys.has(key));
          return (
            <LeadCard
              item={item}
              selectionMode={selectionMode}
              selected={selected}
              onPress={() => onLeadPress(item)}
            />
          );
        }}
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
  selectionBar: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 12
  },
  selectionBtn: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    backgroundColor: colors.card,
    paddingHorizontal: 12,
    paddingVertical: 10,
    minHeight: 40,
    justifyContent: "center"
  },
  selectionBtnText: { color: colors.text, fontWeight: "700", fontSize: 13 },
  bulkBar: {
    marginTop: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12
  },
  selectionCount: { color: colors.text, fontWeight: "700", fontSize: 14 },
  bulkStatusBtn: {
    backgroundColor: colors.accent,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    minHeight: 40,
    justifyContent: "center"
  },
  bulkStatusDisabled: { opacity: 0.4 },
  bulkStatusText: { color: colors.bg, fontWeight: "800", fontSize: 13 },
  statusPicker: {
    marginTop: 12,
    backgroundColor: colors.card,
    borderColor: colors.cardBorder,
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    gap: 10
  },
  statusPickerTitle: { color: colors.text, fontWeight: "700", fontSize: 14 },
  bulkProgress: { marginTop: 10, color: colors.accent, fontWeight: "700", fontSize: 13 },
  resultCard: {
    marginTop: 12,
    backgroundColor: colors.card,
    borderColor: colors.cardBorder,
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    gap: 6
  },
  resultCardSuccess: {
    borderColor: colors.accent
  },
  resultCardPartial: {
    borderColor: "#F59E0B"
  },
  resultCardFailure: {
    borderColor: colors.danger
  },
  resultTitle: {
    color: colors.text,
    fontWeight: "800",
    fontSize: 14
  },
  resultHeadline: {
    color: colors.textSoft,
    fontWeight: "700",
    fontSize: 15,
    lineHeight: 20
  },
  resultHeadlineFailure: {
    color: colors.danger
  },
  resultDetail: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 18
  },
  resultTargetLabel: {
    marginTop: 6,
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.4
  },
  resultTargetValue: {
    color: colors.text,
    fontWeight: "800",
    fontSize: 15
  },
  resultRetryHint: {
    marginTop: 4,
    color: colors.textSoft,
    fontSize: 13,
    lineHeight: 18
  },
  resultDismiss: {
    marginTop: 8,
    alignSelf: "flex-start",
    minHeight: 40,
    justifyContent: "center",
    paddingHorizontal: 4
  },
  resultDismissText: {
    color: colors.accent,
    fontWeight: "800",
    fontSize: 13
  },
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
