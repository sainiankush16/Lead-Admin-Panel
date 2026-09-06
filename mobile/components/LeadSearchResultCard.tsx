import { Pressable, StyleSheet, Text, View } from "react-native";

import { colors } from "@/constants/theme";
import type { MappedSearchResult } from "@/utils/globalSearch";

interface LeadSearchResultCardProps {
  item: MappedSearchResult;
  onPress: () => void;
}

export function LeadSearchResultCard({ item, onPress }: LeadSearchResultCardProps) {
  return (
    <Pressable
      style={styles.card}
      accessibilityRole="button"
      accessibilityLabel={`Open lead ${item.name}`}
      onPress={onPress}
    >
      <Text style={styles.name}>{item.name}</Text>

      <Text style={styles.label}>Project</Text>
      <Text style={styles.value}>{item.projectName}</Text>

      <Text style={styles.label}>Phone</Text>
      <Text style={styles.value}>{item.phone}</Text>

      <Text style={styles.label}>Email</Text>
      <Text style={styles.value}>{item.email}</Text>

      <Text style={styles.label}>Status</Text>
      <View style={styles.statusChip}>
        <Text style={styles.statusText}>{item.status}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderColor: colors.cardBorder,
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12
  },
  name: {
    color: colors.text,
    fontSize: 18,
    fontWeight: "800",
    marginBottom: 10
  },
  label: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: "700",
    marginTop: 8,
    marginBottom: 2,
    textTransform: "uppercase",
    letterSpacing: 0.4
  },
  value: {
    color: colors.textSoft,
    fontSize: 15,
    lineHeight: 20
  },
  statusChip: {
    alignSelf: "flex-start",
    marginTop: 2,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    backgroundColor: colors.bg,
    paddingHorizontal: 10,
    paddingVertical: 6
  },
  statusText: {
    color: colors.text,
    fontWeight: "700",
    fontSize: 13
  }
});
