import { Pressable, StyleSheet, Text, View } from "react-native";

import { ActionButton } from "@/components/ui/ActionButton";
import { AppIcon } from "@/components/ui/AppIcon";
import { colors } from "@/constants/theme";
import type { LeadListItem } from "@/utils/leadList";
import {
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
            <AppIcon
              name={selected ? "checkbox" : "checkboxOutline"}
              size={18}
              color={selected ? colors.bg : colors.textMuted}
            />
          </View>
        ) : null}
        <View style={styles.identity}>
          <Text style={styles.name} numberOfLines={2}>
            {name}
          </Text>
          <Text style={styles.phone} numberOfLines={1}>
            {phone}
          </Text>
        </View>
        <View style={styles.statusChip} accessibilityLabel={`Lead Status ${status}`}>
          <Text style={styles.statusValue} numberOfLines={1}>
            {status}
          </Text>
        </View>
        {!selectionMode ? <AppIcon name="arrow" size={16} color={colors.textMuted} /> : null}
      </View>

      {!selectionMode ? (
        <View style={styles.actions}>
          <ActionButton
            label="Call"
            icon="call"
            compact
            style={styles.action}
            disabled={!hasCall}
            accessibilityLabel={`Call ${name}`}
            onPress={() => {
              void openCall(item.telHref);
            }}
          />
          <ActionButton
            label="WhatsApp"
            icon="whatsapp"
            variant="accent"
            compact
            style={styles.action}
            disabled={!hasWa}
            accessibilityLabel={`WhatsApp ${name}`}
            onPress={() => {
              void openWhatsApp(item.waHref);
            }}
          />
        </View>
      ) : (
        <Text style={styles.selectedHint}>{selected ? "Selected" : "Tap to select"}</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderColor: colors.cardBorder,
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    marginBottom: 12
  },
  cardSelected: {
    borderColor: colors.accent,
    borderWidth: 2,
    backgroundColor: "#172554"
  },
  topRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10
  },
  identity: {
    flex: 1,
    minWidth: 0,
    gap: 2
  },
  checkbox: {
    width: 28,
    height: 28,
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center"
  },
  checkboxSelected: {
    backgroundColor: colors.accent
  },
  name: {
    color: colors.text,
    fontSize: 17,
    fontWeight: "700"
  },
  phone: {
    color: colors.textSoft,
    fontSize: 14
  },
  actions: {
    flexDirection: "row",
    gap: 8,
    marginTop: 12
  },
  action: {
    flex: 1
  },
  statusChip: {
    backgroundColor: "#0F172A",
    borderColor: colors.accent,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 5,
    maxWidth: "34%"
  },
  statusValue: {
    color: colors.accent,
    fontSize: 11,
    fontWeight: "800"
  },
  selectedHint: {
    marginTop: 12,
    color: colors.accent,
    fontSize: 13,
    fontWeight: "700"
  }
});
