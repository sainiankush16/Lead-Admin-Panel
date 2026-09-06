import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { colors } from "@/constants/theme";
import { NEXT_ACTIONS } from "@/utils/leadWorkflow";

interface LeadNextActionsProps {
  onJump: (sectionId: string) => void;
}

export function LeadNextActions({ onJump }: LeadNextActionsProps) {
  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>Next Actions</Text>
      <Text style={styles.hint}>Jump to a step. Nothing runs automatically.</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}
      >
        {NEXT_ACTIONS.map(action => (
          <Pressable
            key={action.id}
            style={styles.chip}
            accessibilityRole="button"
            accessibilityLabel={`Go to ${action.label}`}
            onPress={() => onJump(action.id)}
          >
            <Text style={styles.chipText}>{action.label}</Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: 16 },
  title: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0.4,
    textTransform: "uppercase",
    marginBottom: 4
  },
  hint: {
    color: colors.textMuted,
    fontSize: 12,
    marginBottom: 10
  },
  row: { gap: 8, paddingBottom: 2 },
  chip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    backgroundColor: colors.card,
    paddingHorizontal: 14,
    paddingVertical: 10,
    minHeight: 40,
    justifyContent: "center"
  },
  chipText: { color: colors.textSoft, fontWeight: "700", fontSize: 13 }
});
