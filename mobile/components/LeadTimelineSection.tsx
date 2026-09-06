import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";

import { colors } from "@/constants/theme";
import type { TimelineEvent } from "@/types";
import { mapTimelineDisplayItems } from "@/utils/leadTimeline";

interface LeadTimelineSectionProps {
  events: TimelineEvent[];
  loading: boolean;
  error: string | null;
  onRetry: () => void;
}

export function LeadTimelineSection({ events, loading, error, onRetry }: LeadTimelineSectionProps) {
  const items = mapTimelineDisplayItems(events);

  return (
    <View style={styles.wrap} accessibilityLabel="Lead Timeline">
      <Text style={styles.title}>Timeline</Text>

      {loading ? (
        <View style={styles.loadingRow}>
          <ActivityIndicator color={colors.accent} />
          <Text style={styles.muted}>Loading timeline...</Text>
        </View>
      ) : null}

      {!loading && error ? (
        <View style={styles.errorBlock}>
          <Text style={styles.errorText}>{error}</Text>
          <Pressable
            style={styles.retryBtn}
            accessibilityRole="button"
            accessibilityLabel="Retry loading timeline"
            onPress={onRetry}
          >
            <Text style={styles.retryText}>Retry</Text>
          </Pressable>
        </View>
      ) : null}

      {!loading && !error && items.length === 0 ? (
        <Text style={styles.muted}>No timeline activity yet.</Text>
      ) : null}

      {!loading && !error
        ? items.map(item => (
            <View key={item.id} style={styles.row}>
              <View style={styles.rail}>
                <View style={[styles.dot, item.isDeleted && styles.dotDeleted]} />
                <View style={styles.line} />
              </View>
              <View style={styles.content}>
                <Text style={styles.eventTitle}>{item.title}</Text>
                {item.detail ? <Text style={styles.detail}>{item.detail}</Text> : null}
                <Text style={styles.meta}>{item.actor}</Text>
                {item.timestamp ? <Text style={styles.meta}>{item.timestamp}</Text> : null}
              </View>
            </View>
          ))
        : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: 28, marginBottom: 16 },
  title: {
    color: colors.text,
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 14
  },
  loadingRow: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 12 },
  muted: { color: colors.textMuted, fontSize: 14, marginBottom: 8 },
  errorBlock: { gap: 8, marginBottom: 8 },
  errorText: { color: colors.danger, fontSize: 13 },
  retryBtn: {
    alignSelf: "flex-start",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    paddingHorizontal: 14,
    minHeight: 40,
    justifyContent: "center",
    backgroundColor: colors.card
  },
  retryText: { color: colors.textSoft, fontWeight: "700" },
  row: { flexDirection: "row", gap: 12, minHeight: 64 },
  rail: { width: 16, alignItems: "center" },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.accent,
    marginTop: 5
  },
  dotDeleted: { backgroundColor: colors.textMuted },
  line: {
    flex: 1,
    width: 2,
    backgroundColor: colors.cardBorder,
    marginTop: 4,
    marginBottom: 0
  },
  content: {
    flex: 1,
    paddingBottom: 18,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.cardBorder
  },
  eventTitle: { color: colors.text, fontWeight: "700", fontSize: 15, marginBottom: 4 },
  detail: { color: colors.textSoft, fontSize: 14, lineHeight: 21, marginBottom: 6 },
  meta: { color: colors.textMuted, fontSize: 12, marginTop: 2 }
});
