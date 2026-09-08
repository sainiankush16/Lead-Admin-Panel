import { Pressable, StyleSheet, Text, View } from "react-native";

import { AppIcon } from "@/components/ui/AppIcon";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { statusIconName } from "@/constants/icons";
import { colors } from "@/constants/theme";
import {
  getPipelineSummary,
  type PipelineSummary
} from "@/utils/pipeline";

interface PipelineSummaryCardProps {
  counts: unknown;
  title?: string;
  onSelectStatus?: (status: string) => void;
  showAttention?: boolean;
  showHealth?: boolean;
  /** Compact Lead Status layout for Project Leads (icon + name + count). */
  compact?: boolean;
}

export function PipelineSummaryCard({
  counts,
  title = "Sales Pipeline",
  onSelectStatus,
  showAttention = true,
  showHealth = true,
  compact = false
}: PipelineSummaryCardProps) {
  const summary: PipelineSummary = getPipelineSummary(counts);

  function renderRow(status: string, count: number) {
    const icon = statusIconName(status === "Unknown" ? "" : status);
    const label = onSelectStatus
      ? `View ${count} ${status} leads`
      : `${status}: ${count}`;

    const content = (
      <>
        <View style={styles.rowLeft}>
          <AppIcon name={icon} size={compact ? 16 : 18} color={colors.accent} />
          <Text style={[styles.rowStatus, compact && styles.rowStatusCompact]}>{status}</Text>
        </View>
        <Text style={[styles.rowCount, compact && styles.rowCountCompact]}>{count}</Text>
      </>
    );

    if (!onSelectStatus) {
      return (
        <View key={status} style={[styles.row, compact && styles.rowCompact]} accessibilityLabel={label}>
          {content}
        </View>
      );
    }

    return (
      <Pressable
        key={status}
        style={[styles.rowPressable, compact && styles.rowPressableCompact]}
        accessibilityRole="button"
        accessibilityLabel={label}
        onPress={() => onSelectStatus(status)}
      >
        {content}
      </Pressable>
    );
  }

  return (
    <View
      style={[styles.wrap, compact && styles.wrapCompact]}
      accessibilityLabel={title}
    >
      <SectionHeader title={title} icon={compact ? "status" : "pipeline"} />

      {!compact && showAttention ? (
        <Text style={styles.attention} accessibilityLabel={`Attention ${summary.attention.label}`}>
          Attention: {summary.attention.label}
        </Text>
      ) : null}

      {!compact && showHealth ? <Text style={styles.health}>{summary.health}</Text> : null}

      <Text style={[styles.groupLabel, compact && styles.groupLabelCompact]}>Active</Text>
      {summary.active.map(item => renderRow(item.status, item.count))}

      <Text style={[styles.groupLabel, compact && styles.groupLabelCompact]}>Closed</Text>
      {summary.terminal.map(item => renderRow(item.status, item.count))}

      {summary.unknownStatusCount > 0
        ? renderRow("Unknown", summary.unknownStatusCount)
        : null}
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
    marginBottom: 8,
    gap: 6
  },
  wrapCompact: {
    padding: 10,
    marginBottom: 10,
    gap: 2
  },
  attention: {
    color: colors.accent,
    fontSize: 13,
    fontWeight: "700",
    lineHeight: 18
  },
  health: {
    color: colors.textSoft,
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 4
  },
  groupLabel: {
    marginTop: 6,
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.4,
    textTransform: "uppercase"
  },
  groupLabelCompact: {
    marginTop: 8,
    marginBottom: 2,
    fontSize: 10
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    minHeight: 32,
    paddingVertical: 4
  },
  rowCompact: {
    minHeight: 28,
    paddingVertical: 2
  },
  rowPressable: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    minHeight: 40,
    paddingVertical: 6
  },
  rowPressableCompact: {
    minHeight: 32,
    paddingVertical: 4
  },
  rowLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexShrink: 1,
    flexGrow: 1,
    paddingRight: 8
  },
  rowStatus: {
    color: colors.textSoft,
    fontSize: 14,
    fontWeight: "600",
    flexShrink: 1
  },
  rowStatusCompact: {
    fontSize: 13
  },
  rowCount: {
    color: colors.text,
    fontSize: 15,
    fontWeight: "800",
    minWidth: 28,
    textAlign: "right"
  },
  rowCountCompact: {
    fontSize: 14
  }
});
