import { Pressable, StyleSheet, Text, View } from "react-native";

import { colors } from "@/constants/theme";
import {
  ACTION_CENTER_STATUSES,
  type ActionCenterItem,
  type ActionCenterSummary
} from "@/utils/actionCenter";

interface ActionCenterSectionProps {
  summary: ActionCenterSummary;
  filter: string;
  onFilterChange: (filter: string) => void;
  onOpenLead: (item: ActionCenterItem) => void;
  onViewAll: (status: string | null) => void;
  onWorkNext?: (item: ActionCenterItem) => void;
}

export function ActionCenterSection({
  summary,
  filter,
  onFilterChange,
  onOpenLead,
  onViewAll,
  onWorkNext
}: ActionCenterSectionProps) {
  const counts = summary.counts;
  const workNext = summary.workNext;

  return (
    <View style={styles.wrap} accessibilityLabel="Action Center">
      <Text style={styles.title}>Action Center</Text>
      <Text style={styles.priority} accessibilityLabel={summary.priority.label}>
        {summary.priority.label}
      </Text>
      {!summary.empty ? (
        <Text style={styles.attentionCount} accessibilityLabel={`${counts.total} leads requiring attention`}>
          {counts.total} {counts.total === 1 ? "lead" : "leads"} requiring attention
        </Text>
      ) : null}

      <Text style={styles.needsTitle}>Needs Attention</Text>
      <View style={styles.countRow}>
        {ACTION_CENTER_STATUSES.map(status => (
          <Text key={status} style={styles.countText}>
            {status}: {counts[status] || 0}
          </Text>
        ))}
      </View>

      {workNext && onWorkNext ? (
        <Pressable
          style={styles.workNextBtn}
          accessibilityRole="button"
          accessibilityLabel={`Work Next Lead: ${workNext.name}, ${workNext.status}, ${workNext.projectName}`}
          onPress={() => onWorkNext(workNext)}
        >
          <Text style={styles.workNextBtnText}>Work Next Lead</Text>
          <Text style={styles.workNextHint}>
            {workNext.status} · {workNext.name} · {workNext.projectName}
          </Text>
        </Pressable>
      ) : null}

      <View style={styles.filters}>
        {summary.filterOptions.map(option => {
          const active = filter === option;
          return (
            <Pressable
              key={option}
              style={[styles.chip, active && styles.chipActive]}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              accessibilityLabel={`Action Center filter ${option}`}
              onPress={() => onFilterChange(option)}
            >
              <Text style={[styles.chipText, active && styles.chipTextActive]}>{option}</Text>
            </Pressable>
          );
        })}
      </View>

      {summary.empty ? (
        <Text style={styles.empty}>{summary.emptyLabel}</Text>
      ) : summary.visibleItems.length === 0 ? (
        <Text style={styles.empty}>No leads match this filter.</Text>
      ) : (
        summary.visibleItems.map(item => (
          <Pressable
            key={`${item.projectId}-${item.rowNumber}`}
            style={styles.item}
            accessibilityRole="button"
            accessibilityLabel={`${item.status}. ${item.name}. ${item.projectName}. ${item.contactLabel}`}
            onPress={() => onOpenLead(item)}
          >
            <Text style={styles.itemStatus}>{String(item.status).toUpperCase()}</Text>
            <Text style={styles.itemName}>{item.name}</Text>
            <Text style={styles.itemProject}>{item.projectName}</Text>
            <Text style={styles.itemContact}>{item.contactLabel}</Text>
          </Pressable>
        ))
      )}

      {!summary.empty && summary.hasMore ? (
        <Pressable
          style={styles.viewAll}
          accessibilityRole="button"
          accessibilityLabel={
            filter !== "All"
              ? `View ${filter} leads`
              : summary.priority.status
                ? `View ${summary.priority.status} leads`
                : "View leads"
          }
          onPress={() => onViewAll(filter === "All" ? summary.priority.status : filter)}
        >
          <Text style={styles.viewAllText}>
            {filter !== "All"
              ? `View ${filter} leads`
              : summary.priority.status
                ? `View ${summary.priority.status} leads`
                : "View leads"}
          </Text>
        </Pressable>
      ) : null}
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
  priority: {
    color: colors.accent,
    fontSize: 14,
    fontWeight: "700"
  },
  attentionCount: {
    color: colors.textSoft,
    fontSize: 13,
    fontWeight: "600"
  },
  workNextBtn: {
    marginTop: 4,
    backgroundColor: colors.accent,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 2
  },
  workNextBtnText: {
    color: colors.bg,
    fontSize: 15,
    fontWeight: "800"
  },
  workNextHint: {
    color: colors.bg,
    opacity: 0.85,
    fontSize: 12,
    fontWeight: "600"
  },
  needsTitle: {
    marginTop: 4,
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.4,
    textTransform: "uppercase"
  },
  countRow: {
    gap: 2
  },
  countText: {
    color: colors.textSoft,
    fontSize: 13,
    fontWeight: "600"
  },
  filters: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 4
  },
  chip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    backgroundColor: colors.bg,
    paddingHorizontal: 10,
    paddingVertical: 8
  },
  chipActive: {
    backgroundColor: colors.accent,
    borderColor: colors.accent
  },
  chipText: {
    color: colors.textSoft,
    fontSize: 12,
    fontWeight: "700"
  },
  chipTextActive: {
    color: colors.bg
  },
  empty: {
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 20,
    marginTop: 4
  },
  item: {
    borderWidth: 1,
    borderColor: colors.cardBorder,
    backgroundColor: colors.bg,
    borderRadius: 10,
    padding: 12,
    gap: 2
  },
  itemStatus: {
    color: colors.accent,
    fontSize: 12,
    fontWeight: "800"
  },
  itemName: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "700"
  },
  itemProject: {
    color: colors.textSoft,
    fontSize: 13
  },
  itemContact: {
    marginTop: 2,
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: "600"
  },
  viewAll: {
    marginTop: 4,
    alignSelf: "flex-start",
    minHeight: 40,
    justifyContent: "center"
  },
  viewAllText: {
    color: colors.accent,
    fontWeight: "800",
    fontSize: 14
  }
});
