import { Pressable, StyleSheet, Text, View } from "react-native";

import { colors } from "@/constants/theme";
import { contactActionAvailability } from "@/utils/leadContactActivity";
import { openCall, openEmail, openWhatsApp } from "@/utils/linking";

interface LeadContactActionsProps {
  name: string;
  telHref: string | null;
  waHref: string | null;
  mailtoHref: string | null;
}

export function LeadContactActions({
  name,
  telHref,
  waHref,
  mailtoHref
}: LeadContactActionsProps) {
  const availability = contactActionAvailability({ telHref, waHref, mailtoHref });

  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>Contact Actions</Text>
      <View style={styles.actions}>
        <Pressable
          style={[styles.actionBtn, !availability.canCall && styles.disabled]}
          disabled={!availability.canCall}
          accessibilityRole="button"
          accessibilityLabel={`Call ${name}`}
          accessibilityState={{ disabled: !availability.canCall }}
          onPress={() => {
            void openCall(availability.telHref);
          }}
        >
          <Text style={styles.actionText}>Call</Text>
        </Pressable>
        <Pressable
          style={[styles.actionBtn, styles.waBtn, !availability.canWhatsApp && styles.disabled]}
          disabled={!availability.canWhatsApp}
          accessibilityRole="button"
          accessibilityLabel={`WhatsApp ${name}`}
          accessibilityState={{ disabled: !availability.canWhatsApp }}
          onPress={() => {
            void openWhatsApp(availability.waHref);
          }}
        >
          <Text style={[styles.actionText, styles.waText]}>WhatsApp</Text>
        </Pressable>
        <Pressable
          style={[styles.actionBtn, !availability.canEmail && styles.disabled]}
          disabled={!availability.canEmail}
          accessibilityRole="button"
          accessibilityLabel={`Email ${name}`}
          accessibilityState={{ disabled: !availability.canEmail }}
          onPress={() => {
            void openEmail(availability.mailtoHref);
          }}
        >
          <Text style={styles.actionText}>Email</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: 18, marginBottom: 18 },
  title: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0.4,
    textTransform: "uppercase",
    marginBottom: 10
  },
  actions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10
  },
  actionBtn: {
    flexGrow: 1,
    flexBasis: "30%",
    minHeight: 48,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#334155",
    paddingHorizontal: 8
  },
  waBtn: { backgroundColor: colors.accent },
  disabled: { opacity: 0.35 },
  actionText: { color: colors.text, fontWeight: "700", fontSize: 14 },
  waText: { color: colors.bg }
});
