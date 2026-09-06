import { Pressable, StyleSheet, Text, View } from "react-native";

import { colors } from "@/constants/theme";
import type { LeadListItem } from "@/utils/leadList";
import {
  displayLeadListEmail,
  displayLeadListName,
  displayLeadListPhone,
  displayLeadListStatus
} from "@/utils/leadList";
import { openCall, openWhatsApp } from "@/utils/linking";

interface LeadCardProps {
  item: LeadListItem;
  onPress: () => void;
}

export function LeadCard({ item, onPress }: LeadCardProps) {
  const hasCall = Boolean(item.telHref);
  const hasWa = Boolean(item.waHref);
  const name = displayLeadListName(item.name);
  const phone = displayLeadListPhone(item.phone);
  const email = displayLeadListEmail(item.email);
  const status = displayLeadListStatus(item.status);

  return (
    <Pressable
      style={styles.card}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Open lead ${name}, status ${status}`}
    >
      <View style={styles.topRow}>
        <Text style={styles.name}>{name}</Text>
        <View style={styles.statusChip} accessibilityLabel={`Lead Status ${status}`}>
          <Text style={styles.statusValue}>{status}</Text>
        </View>
      </View>

      <Text style={styles.label}>Phone</Text>
      <Text style={styles.value}>{phone}</Text>

      <Text style={styles.label}>Email</Text>
      <Text style={styles.value}>{email}</Text>

      <View style={styles.actions}>
        <Pressable
          style={[styles.actionBtn, !hasCall && styles.actionDisabled]}
          disabled={!hasCall}
          accessibilityRole="button"
          accessibilityLabel={`Call ${name}`}
          accessibilityState={{ disabled: !hasCall }}
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
          accessibilityLabel={`WhatsApp ${name}`}
          accessibilityState={{ disabled: !hasWa }}
          onPress={() => {
            void openWhatsApp(item.waHref);
          }}
        >
          <Text style={[styles.actionText, styles.waText]}>WhatsApp</Text>
        </Pressable>
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
  topRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 10
  },
  name: {
    flex: 1,
    color: colors.text,
    fontSize: 18,
    fontWeight: "700"
  },
  label: {
    marginTop: 10,
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.4
  },
  value: {
    marginTop: 2,
    color: colors.textSoft,
    fontSize: 15,
    lineHeight: 20
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
  statusChip: {
    alignSelf: "flex-start",
    backgroundColor: "#0F172A",
    borderColor: colors.accent,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    maxWidth: "42%"
  },
  statusValue: {
    color: colors.accent,
    fontSize: 12,
    fontWeight: "800"
  },
  hint: {
    marginTop: 12,
    color: colors.textMuted,
    fontSize: 12
  }
});
