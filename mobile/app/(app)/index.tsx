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
import { SafeAreaView } from "react-native-safe-area-context";

import { BRAND_NAME } from "@/constants/branding";
import { LEAD_STATUSES } from "@/constants/leadStatus";
import { colors } from "@/constants/theme";
import { useAuth } from "@/hooks/useAuth";
import { ApiClientError } from "@/services/api";
import { loadDashboardSummary } from "@/services/dashboard";
import {
  greetingForDate,
  type DashboardSummary
} from "@/utils/dashboardSummary";

function formatCount(value: number): string {
  return new Intl.NumberFormat("en-IN").format(value);
}

export default function DashboardScreen() {
  const { user } = useAuth();
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (mode: "initial" | "refresh" = "initial") => {
    if (mode === "refresh") setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const data = await loadDashboardSummary();
      setSummary(data);
    } catch (err) {
      if (err instanceof ApiClientError && err.status === 401) {
        // AuthProvider clears session and login screen will show expired message.
        setError("Your session has expired.");
      } else if (err instanceof TypeError) {
        setError("Please check your internet connection.");
      } else if (err instanceof ApiClientError) {
        setError(err.message || "Unable to load dashboard.");
      } else {
        setError("Unable to load dashboard.");
      }
      if (mode === "initial") setSummary(null);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load("initial");
  }, [load]);

  const displayName = user?.name?.trim() || user?.loginId || "there";

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

        {summary && summary.hasProjects && summary.hasLeads ? (
          <>
            <View style={styles.totalCard} accessibilityRole="summary">
              <Text style={styles.totalLabel}>TOTAL LEADS</Text>
              <Text style={styles.totalValue}>{formatCount(summary.totalLeads)}</Text>
            </View>

            <View style={styles.statusGrid}>
              {LEAD_STATUSES.map(status => (
                <View key={status} style={styles.statusCard} accessibilityLabel={`${status}: ${summary.statuses[status]}`}>
                  <Text style={styles.statusName}>{status}</Text>
                  <Text style={styles.statusCount}>{formatCount(summary.statuses[status])}</Text>
                </View>
              ))}
            </View>

            {summary.unknownStatusCount > 0 ? (
              <Text style={styles.unknownNote}>
                Unknown / blank status: {formatCount(summary.unknownStatusCount)}
              </Text>
            ) : null}

            <Text style={styles.sectionTitle}>Projects</Text>
            {summary.projects.map(project => (
              <View key={project.projectId} style={styles.projectCard}>
                <Text style={styles.projectName}>{project.projectName}</Text>
                <Text style={styles.projectCount}>
                  {formatCount(project.leadCount)} {project.leadCount === 1 ? "Lead" : "Leads"}
                </Text>
              </View>
            ))}
          </>
        ) : null}

        {summary && summary.hasProjects && !summary.hasLeads ? (
          <>
            <Text style={styles.sectionTitle}>Projects</Text>
            {summary.projects.map(project => (
              <View key={project.projectId} style={styles.projectCard}>
                <Text style={styles.projectName}>{project.projectName}</Text>
                <Text style={styles.projectCount}>0 Leads</Text>
              </View>
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
    marginTop: 40,
    alignItems: "center",
    gap: 12
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
    marginBottom: 16
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
  statusGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginBottom: 8
  },
  statusCard: {
    flexBasis: "47%",
    flexGrow: 1,
    backgroundColor: colors.card,
    borderColor: colors.cardBorder,
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    minHeight: 76
  },
  statusName: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: "600"
  },
  statusCount: {
    marginTop: 8,
    color: colors.text,
    fontSize: 24,
    fontWeight: "700"
  },
  unknownNote: {
    marginTop: 4,
    marginBottom: 8,
    color: colors.textMuted,
    fontSize: 12
  },
  sectionTitle: {
    marginTop: 16,
    marginBottom: 10,
    color: colors.text,
    fontSize: 18,
    fontWeight: "700"
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
  }
});
