import { Pressable, StyleSheet, Text, View } from "react-native";

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
    const content = (
      <>
        <Text style={styles.rowStatus}>{status}</Text>
        <Text style={styles.rowCount}>{count}</Text>
      </>
    );

    if (!onSelectStatus) {
      return (
        <View key={status} style={styles.row} accessibilityLabel={`${status}: ${count}`}>
          {content}
        </View>
      );
    }

    return (
      <Pressable
        key={status}
        style={styles.rowPressable}
        accessibilityRole="button"
        accessibilityLabel={`${status}: ${count}. View leads`}
        onPress={() => onSelectStatus(status)}
      >
        {content}
        <Text style={styles.viewHint}>View leads</Text>
      </Pressable>
    );
  }

  return (
    <View
      style={[styles.wrap, compact && styles.wrapCompact]}
      accessibilityLabel={title}
    >
      <Text style={styles.title}>{title}</Text>

      {showAttention ? (
        <Text style={styles.attention} accessibilityLabel={`Attention ${summary.attention.label}`}>
          Attention: {summary.attention.label}
        </Text>
      ) : null}

      {showHealth ? <Text style={styles.health}>{summary.health}</Text> : null}

      <Text style={styles.groupLabel}>Active</Text>
      {summary.active.map(item => renderRow(item.status, item.count))}

      <Text style={styles.groupLabel}>Closed</Text>
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
    padding: 12,
    marginBottom: 10
  },
  title: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "800",
    marginBottom: 2
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
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    minHeight: 32,
    paddingVertical: 4
  },
  rowPressable: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    alignItems: "center",
    minHeight: 40,
    paddingVertical: 6,
    gap: 4
  },
  rowStatus: {
    color: colors.textSoft,
    fontSize: 14,
    fontWeight: "600",
    flexGrow: 1
  },
  rowCount: {
    color: colors.text,
    fontSize: 15,
    fontWeight: "800",
    minWidth: 36,
    textAlign: "right"
  },
  viewHint: {
    width: "100%",
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: "600"
  }
});
