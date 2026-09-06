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
  selectionMode?: boolean;
  selected?: boolean;
}

export function LeadCard({
  item,
  onPress,
  selectionMode = false,
  selected = false
}: LeadCardProps) {
  const hasCall = Boolean(item.telHref);
  const hasWa = Boolean(item.waHref);
  const name = displayLeadListName(item.name);
  const phone = displayLeadListPhone(item.phone);
  const email = displayLeadListEmail(item.email);
  const status = displayLeadListStatus(item.status);

  return (
    <Pressable
      style={[styles.card, selectionMode && selected && styles.cardSelected]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={
        selectionMode
          ? `${selected ? "Deselect" : "Select"} lead ${name}, status ${status}`
          : `Open lead ${name}, status ${status}`
      }
      accessibilityState={selectionMode ? { selected } : undefined}
    >
      <View style={styles.topRow}>
        {selectionMode ? (
          <View
            style={[styles.checkbox, selected && styles.checkboxSelected]}
            accessibilityElementsHidden
            importantForAccessibility="no"
          >
            <Text style={styles.checkboxMark}>{selected ? "✓" : ""}</Text>
          </View>
        ) : null}
        <Text style={styles.name}>{name}</Text>
        <View style={styles.statusChip} accessibilityLabel={`Lead Status ${status}`}>
          <Text style={styles.statusValue}>{status}</Text>
        </View>
      </View>

      <Text style={styles.label}>Phone</Text>
      <Text style={styles.value}>{phone}</Text>

      <Text style={styles.label}>Email</Text>
      <Text style={styles.value}>{email}</Text>

      {!selectionMode ? (
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
      ) : (
        <Text style={styles.selectedHint}>{selected ? "Selected" : "Tap to select"}</Text>
      )}

      {!selectionMode ? <Text style={styles.hint}>Tap for details</Text> : null}
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
  cardSelected: {
    borderColor: colors.accent,
    borderWidth: 2,
    backgroundColor: "#172554"
  },
  topRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 10
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: colors.textMuted,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 2
  },
  checkboxSelected: {
    borderColor: colors.accent,
    backgroundColor: colors.accent
  },
  checkboxMark: {
    color: colors.bg,
    fontSize: 14,
    fontWeight: "800",
    lineHeight: 16
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
  },
  selectedHint: {
    marginTop: 14,
    color: colors.accent,
    fontSize: 13,
    fontWeight: "700"
  }
});
