import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View
} from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";

import { ActionCenterSection } from "@/components/ActionCenterSection";
import { PipelineSummaryCard } from "@/components/PipelineSummaryCard";
import { BRAND_NAME } from "@/constants/branding";
import { colors } from "@/constants/theme";
import { useAuth } from "@/hooks/useAuth";
import { ApiClientError } from "@/services/api";
import { loadDashboardSummary } from "@/services/dashboard";
import type { ProjectLeadsResponse } from "@/types";
import {
  getActionCenterSummary,
  type ActionCenterItem
} from "@/utils/actionCenter";
import {
  ACTIONABLE_STATUSES,
  buildLeadListPath,
  greetingForDate,
  resolveActionableLeadTarget,
  type ActionableStatus,
  type DashboardSummary
} from "@/utils/dashboardSummary";
import { resolvePipelineLeadTarget } from "@/utils/pipeline";

function formatCount(value: number): string {
  return new Intl.NumberFormat("en-IN").format(value);
}

export default function DashboardScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [projectLeads, setProjectLeads] = useState<ProjectLeadsResponse[]>([]);
  const [actionFilter, setActionFilter] = useState("All");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (mode: "initial" | "refresh" = "initial") => {
    if (mode === "refresh") setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const data = await loadDashboardSummary();
      setSummary(data.summary);
      setProjectLeads(Array.isArray(data.projectLeads) ? data.projectLeads : []);
    } catch (err) {
      if (err instanceof ApiClientError && err.status === 401) {
        setError("Your session has expired.");
      } else if (err instanceof TypeError) {
        setError("Please check your internet connection.");
      } else if (err instanceof ApiClientError) {
        setError(err.message || "Unable to load dashboard.");
      } else {
        setError("Unable to load dashboard.");
      }
      if (mode === "initial") {
        setSummary(null);
        setProjectLeads([]);
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load("initial");
  }, [load]);

  const actionCenter = useMemo(
    () => getActionCenterSummary(projectLeads, { filter: actionFilter, limit: 5 }),
    [projectLeads, actionFilter]
  );

  const displayName = user?.name?.trim() || user?.loginId || "there";

  function openProjectLeads(projectId: number, status?: string | null) {
    const path = buildLeadListPath(projectId, status);
    if (!path) return;
    router.push(path);
  }

  function openActionable(status: ActionableStatus) {
    if (!summary) return;
    const target = resolveActionableLeadTarget(summary, status);
    if (!target) return;
    openProjectLeads(target.projectId, target.status);
  }

  function openPipelineStatus(status: string) {
    if (!summary) return;
    const target = resolvePipelineLeadTarget(summary, status);
    if (!target?.path) return;
    router.push(target.path);
  }

  function openActionLead(item: ActionCenterItem) {
    if (!item?.detailHref) return;
    router.push(item.detailHref);
  }

  function openWorkNextLead(item: ActionCenterItem) {
    if (!item?.detailHref) return;
    router.push(item.detailHref);
  }

  function openActionViewAll(status: string | null) {
    if (!summary || !status) return;
    const target = resolvePipelineLeadTarget(summary, status);
    if (!target?.path) return;
    router.push(target.path);
  }

  const showMetrics = Boolean(summary && summary.hasProjects);

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
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
        <Text style={styles.brand}>{BRAND_NAME}</Text>
        <Text style={styles.greeting}>
          {greetingForDate()}, {displayName}
        </Text>

        {loading && !summary ? (
          <View style={styles.centerBlock}>
            <ActivityIndicator color={colors.accent} size="large" />
            <Text style={styles.centerText}>Loading dashboard...</Text>
          </View>
        ) : null}

        {error && !loading ? (
          <View style={styles.centerBlock}>
            <Text style={styles.errorText}>{error}</Text>
            <Pressable
              style={styles.retryBtn}
              accessibilityRole="button"
              accessibilityLabel="Retry loading dashboard"
              onPress={() => {
                void load("initial");
              }}
            >
              <Text style={styles.retryText}>Retry</Text>
            </Pressable>
          </View>
        ) : null}

        {!loading && !error && summary && !summary.hasProjects ? (
          <View style={styles.centerBlock}>
            <Text style={styles.centerText}>No projects assigned.</Text>
          </View>
        ) : null}

        {!loading && !error && summary && summary.hasProjects && !summary.hasLeads ? (
          <View style={styles.centerBlock}>
            <Text style={styles.centerText}>No leads found.</Text>
          </View>
        ) : null}

        {showMetrics && summary ? (
          <>
            <View style={styles.totalCard} accessibilityRole="summary">
              <Text style={styles.totalLabel}>TOTAL LEADS</Text>
              <Text style={styles.totalValue}>{formatCount(summary.totalLeads)}</Text>
            </View>

            {summary.hasLeads ? (
              <PipelineSummaryCard
                title="Sales Pipeline"
                counts={{
                  statuses: summary.statuses,
                  unknownStatusCount: summary.unknownStatusCount
                }}
                onSelectStatus={openPipelineStatus}
                showAttention
                showHealth
              />
            ) : null}

            {summary.hasLeads ? (
              <ActionCenterSection
                summary={actionCenter}
                filter={actionFilter}
                onFilterChange={setActionFilter}
                onOpenLead={openActionLead}
                onViewAll={openActionViewAll}
                onWorkNext={openWorkNextLead}
              />
            ) : null}

            <Text style={styles.sectionTitle}>Actionable Leads</Text>
            <View style={styles.actionableGrid}>
              {ACTIONABLE_STATUSES.map(status => {
                const count = summary.actionable[status] || 0;
                return (
                  <Pressable
                    key={status}
                    style={styles.actionableCard}
                    accessibilityRole="button"
                    accessibilityLabel={`${status}: ${count}. Open filtered lead list`}
                    onPress={() => openActionable(status)}
                  >
                    <Text style={styles.actionableName}>{status}</Text>
                    <Text style={styles.actionableCount}>{formatCount(count)}</Text>
                    <Text style={styles.actionableHint}>View leads</Text>
                  </Pressable>
                );
              })}
            </View>

            <Text style={styles.sectionTitle}>Projects</Text>
            {summary.projects.map(project => (
              <Pressable
                key={project.projectId}
                style={styles.projectCard}
                accessibilityRole="button"
                accessibilityLabel={`${project.projectName}: ${project.leadCount} leads. Open project`}
                onPress={() => openProjectLeads(project.projectId)}
              >
                <Text style={styles.projectName}>{project.projectName}</Text>
                <Text style={styles.projectCount}>
                  {formatCount(project.leadCount)} {project.leadCount === 1 ? "Lead" : "Leads"}
                </Text>
                {(project.statusCounts?.["Follow Up"] || 0) > 0 ? (
                  <Text style={styles.projectFollowUp}>
                    Follow Up: {formatCount(project.statusCounts["Follow Up"])}
                  </Text>
                ) : null}
                <Text style={styles.projectHint}>Open lead list</Text>
              </Pressable>
            ))}
          </>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: 20, paddingBottom: 28, paddingTop: 8 },
  brand: {
    color: colors.text,
    fontSize: 28,
    fontWeight: "700",
    letterSpacing: 0.5
  },
  greeting: {
    marginTop: 6,
    marginBottom: 18,
    color: colors.textSoft,
    fontSize: 16
  },
  centerBlock: {
    marginTop: 24,
    alignItems: "center",
    gap: 12,
    marginBottom: 8
  },
  centerText: {
    color: colors.textMuted,
    fontSize: 15,
    textAlign: "center"
  },
  errorText: {
    color: colors.danger,
    fontSize: 15,
    textAlign: "center"
  },
  retryBtn: {
    marginTop: 4,
    backgroundColor: colors.accent,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 10,
    minHeight: 44,
    justifyContent: "center"
  },
  retryText: {
    color: colors.bg,
    fontWeight: "700",
    fontSize: 15
  },
  totalCard: {
    backgroundColor: colors.accentDark,
    borderRadius: 16,
    padding: 20,
    marginBottom: 8
  },
  totalLabel: {
    color: "#E0F2FE",
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 1
  },
  totalValue: {
    marginTop: 8,
    color: "#F8FAFC",
    fontSize: 40,
    fontWeight: "800"
  },
  sectionTitle: {
    marginTop: 16,
    marginBottom: 10,
    color: colors.text,
    fontSize: 18,
    fontWeight: "700"
  },
  actionableGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginBottom: 4
  },
  actionableCard: {
    flexBasis: "47%",
    flexGrow: 1,
    backgroundColor: colors.card,
    borderColor: colors.accent,
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    minHeight: 92
  },
  actionableName: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: "700"
  },
  actionableCount: {
    marginTop: 8,
    color: colors.accent,
    fontSize: 26,
    fontWeight: "800"
  },
  actionableHint: {
    marginTop: 6,
    color: colors.textSoft,
    fontSize: 12,
    fontWeight: "600"
  },
  projectCard: {
    backgroundColor: colors.card,
    borderColor: colors.cardBorder,
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    marginBottom: 10
  },
  projectName: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "600"
  },
  projectCount: {
    marginTop: 6,
    color: colors.textMuted,
    fontSize: 14
  },
  projectFollowUp: {
    marginTop: 4,
    color: colors.accent,
    fontSize: 13,
    fontWeight: "700"
  },
  projectHint: {
    marginTop: 8,
    color: colors.textSoft,
    fontSize: 12,
    fontWeight: "600"
  }
});
