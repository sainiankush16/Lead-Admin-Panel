import { Pressable, StyleSheet, Text, View } from "react-native";

import { colors } from "@/constants/theme";
import type { LeadListItem } from "@/utils/leadList";
import { openCall, openWhatsApp } from "@/utils/linking";

interface LeadCardProps {
  item: LeadListItem;
  onPress: () => void;
}

export function LeadCard({ item, onPress }: LeadCardProps) {
  const hasCall = Boolean(item.telHref);
  const hasWa = Boolean(item.waHref);

  return (
    <Pressable
      style={styles.card}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Lead ${item.name}`}
    >
      <Text style={styles.name}>{item.name}</Text>
      <Text style={styles.phone}>
        {item.phone ? `📞 ${item.phone}` : "No phone number"}
      </Text>

      <View style={styles.actions}>
        <Pressable
          style={[styles.actionBtn, !hasCall && styles.actionDisabled]}
          disabled={!hasCall}
          accessibilityRole="button"
          accessibilityLabel={`Call ${item.name}`}
          onPress={() => {
            void openCall(item.telHref);
          }}
        >
          <Text style={styles.actionText}>Call</Text>
        </Pressable>
        <Pressable
          style={[styles.actionBtn, styles.waBtn, !hasWa && styles.actionDisabled]}
          disabled={!hasWa}
          accessibilityRole="button"
          accessibilityLabel={`WhatsApp ${item.name}`}
          onPress={() => {
            void openWhatsApp(item.waHref);
          }}
        >
          <Text style={[styles.actionText, styles.waText]}>WhatsApp</Text>
        </Pressable>
      </View>

      <Text style={styles.statusLabel}>Lead Status</Text>
      <View style={styles.statusChip}>
        <Text style={styles.statusValue}>{item.status}</Text>
      </View>

      <Text style={styles.hint}>Tap for details</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderColor: colors.cardBorder,
    borderWidth: 1,
    borderRadius: 14,
    padding: 16,
    marginBottom: 12
  },
  name: {
    color: colors.text,
    fontSize: 18,
    fontWeight: "700"
  },
  phone: {
    marginTop: 8,
    color: colors.textSoft,
    fontSize: 15
  },
  actions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 14
  },
  actionBtn: {
    flex: 1,
    minHeight: 44,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#334155"
  },
  waBtn: {
    backgroundColor: colors.accent
  },
  actionDisabled: {
    opacity: 0.35
  },
  actionText: {
    color: colors.text,
    fontWeight: "700",
    fontSize: 14
  },
  waText: {
    color: colors.bg
  },
  statusLabel: {
    marginTop: 14,
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: "600"
  },
  statusChip: {
    marginTop: 6,
    alignSelf: "flex-start",
    backgroundColor: "#0F172A",
    borderColor: colors.cardBorder,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6
  },
  statusValue: {
    color: colors.text,
    fontSize: 13,
    fontWeight: "600"
  },
  hint: {
    marginTop: 12,
    color: colors.textMuted,
    fontSize: 12
  }
});
