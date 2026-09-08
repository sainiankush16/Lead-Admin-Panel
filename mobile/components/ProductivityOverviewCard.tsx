import { StyleSheet, Text, View } from "react-native";

import { SectionHeader } from "@/components/ui/SectionHeader";
import { colors } from "@/constants/theme";
import type { ProductivityAnalytics } from "@/utils/productivityAnalytics";

interface ProductivityOverviewCardProps {
  analytics: ProductivityAnalytics;
}

function formatCount(value: number): string {
  return new Intl.NumberFormat("en-IN").format(value);
}

export function ProductivityOverviewCard({ analytics }: ProductivityOverviewCardProps) {
  if (analytics.empty) {
    return (
      <View style={styles.wrap} accessibilityLabel="Productivity Overview">
        <SectionHeader title="Productivity Overview" icon="productivity" />
        <Text style={styles.empty}>{analytics.emptyLabel}</Text>
      </View>
    );
  }

  const conversionLabel = analytics.conversion.available
    ? analytics.conversion.display
    : "—";

  return (
    <View style={styles.wrap} accessibilityLabel="Productivity Overview">
      <SectionHeader title="Productivity Overview" icon="productivity" />
      <Text style={styles.subtitle}>Workload and conversion from current leads</Text>

      <View style={styles.metrics}>
        <Metric label="Active Leads" value={formatCount(analytics.active)} />
        <Metric label="Follow Up" value={formatCount(analytics.followUp)} />
        <Metric label="Converted" value={formatCount(analytics.converted)} />
        <Metric label="Closed" value={formatCount(analytics.closed)} />
        <Metric
          label="Conversion Rate"
          value={conversionLabel}
          accessibilityLabel={
            analytics.conversion.available
              ? `Conversion Rate ${analytics.conversion.percent} percent`
              : "Conversion Rate unavailable"
          }
        />
      </View>

      {analytics.unknown > 0 ? (
        <Text style={styles.unknown} accessibilityLabel={`Unknown: ${analytics.unknown}`}>
          Unknown: {formatCount(analytics.unknown)}
        </Text>
      ) : null}

      <Text style={styles.sectionLabel}>Top Work Stage</Text>
      <Text
        style={styles.sectionValue}
        accessibilityLabel={analytics.topWorkStage.label}
      >
        {analytics.topWorkStage.label}
      </Text>

      <Text style={styles.sectionLabel}>Top Workload</Text>
      <Text style={styles.sectionValue} accessibilityLabel={analytics.topProject.label}>
        {analytics.topProject.label}
      </Text>

      <Text style={styles.sectionLabel}>Project Workload</Text>
      {analytics.projects.map(project => (
        <View
          key={project.projectId}
          style={styles.projectRow}
          accessibilityLabel={`${project.projectName}. ${project.active} active. ${project.followUp} Follow Up. ${project.converted} Converted`}
        >
          <Text style={styles.projectName}>{project.projectName}</Text>
          <Text style={styles.projectMeta}>
            {formatCount(project.active)} active · {formatCount(project.followUp)} Follow Up ·{" "}
            {formatCount(project.converted)} Converted
          </Text>
        </View>
      ))}

      <Text style={styles.footnote}>
        Conversion Rate is a current distribution share, not a forecast or probability.
      </Text>
    </View>
  );
}

function Metric({
  label,
  value,
  accessibilityLabel
}: {
  label: string;
  value: string;
  accessibilityLabel?: string;
}) {
  return (
    <View
      style={styles.metric}
      accessibilityLabel={accessibilityLabel || `${label}: ${value}`}
    >
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: colors.card,
    borderColor: colors.cardBorder,
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    marginTop: 16,
    marginBottom: 4,
    gap: 8
  },
  title: {
    color: colors.text,
    fontSize: 18,
    fontWeight: "800"
  },
  subtitle: {
    color: colors.textMuted,
    fontSize: 12,
    marginBottom: 4
  },
  empty: {
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 20,
    marginTop: 4
  },
  metrics: {
    gap: 8
  },
  metric: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12
  },
  metricLabel: {
    color: colors.textSoft,
    fontSize: 13,
    fontWeight: "600",
    flexShrink: 1
  },
  metricValue: {
    color: colors.text,
    fontSize: 15,
    fontWeight: "800"
  },
  unknown: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: "600"
  },
  sectionLabel: {
    marginTop: 6,
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.4,
    textTransform: "uppercase"
  },
  sectionValue: {
    color: colors.accent,
    fontSize: 14,
    fontWeight: "700"
  },
  projectRow: {
    borderTopWidth: 1,
    borderTopColor: colors.cardBorder,
    paddingTop: 8,
    gap: 2
  },
  projectName: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "700"
  },
  projectMeta: {
    color: colors.textSoft,
    fontSize: 12,
    fontWeight: "600",
    flexWrap: "wrap"
  },
  footnote: {
    marginTop: 4,
    color: colors.textMuted,
    fontSize: 11,
    lineHeight: 15
  }
});
