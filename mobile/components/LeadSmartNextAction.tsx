import { Pressable, StyleSheet, Text, View } from "react-native";

import { ActionButton } from "@/components/ui/ActionButton";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { colors } from "@/constants/theme";
import type { LeadStatusValue } from "@/constants/leadStatus";
import type { TimelineEvent } from "@/types";
import {
  buildLeadProductivitySummary,
  type LeadProductivitySummary
} from "@/utils/leadProductivity";
import { openCall, openEmail, openWhatsApp } from "@/utils/linking";

interface LeadSmartNextActionProps {
  status: string;
  telHref: string | null;
  waHref: string | null;
  mailtoHref: string | null;
  timelineEvents: TimelineEvent[];
  onSelectQuickStatus: (status: LeadStatusValue) => void;
  onJumpToStatus: () => void;
}

export function LeadSmartNextAction({
  status,
  telHref,
  waHref,
  mailtoHref,
  timelineEvents,
  onSelectQuickStatus,
  onJumpToStatus
}: LeadSmartNextActionProps) {
  const summary: LeadProductivitySummary = buildLeadProductivitySummary({
    status,
    telHref,
    waHref,
    mailtoHref,
    timelineEvents
  });

  function runPrimary() {
    const action = summary.primaryAction;
    if (action.type === "call") {
      void openCall(action.href);
      return;
    }
    if (action.type === "email") {
      void openEmail(action.href);
      return;
    }
    if (action.type === "review") {
      onJumpToStatus();
    }
  }

  const primaryDisabled = summary.primaryAction.type === "none";
  const primaryIcon =
    summary.primaryAction.type === "call"
      ? "call"
      : summary.primaryAction.type === "email"
        ? "email"
        : "status";

  return (
    <View style={styles.wrap} accessibilityLabel="Smart next action">
      <SectionHeader title="Recommended Next Action" icon="play" />
      <Text style={styles.recommendation}>{summary.recommendation}</Text>
      <Text style={styles.stageHint}>{summary.stageHint}</Text>
      <Text style={styles.activity}>{summary.activitySummary}</Text>

      <View style={styles.ctaRow}>
        <ActionButton
          label={summary.primaryAction.label}
          icon={primaryIcon}
          variant="primary"
          disabled={primaryDisabled}
          accessibilityLabel={summary.primaryAction.label}
          onPress={runPrimary}
        />

        {summary.showWhatsApp ? (
          <ActionButton
            label="WhatsApp"
            icon="whatsapp"
            variant="accent"
            accessibilityLabel="WhatsApp Lead"
            onPress={() => {
              void openWhatsApp(waHref);
            }}
          />
        ) : null}
      </View>

      {summary.quickStatuses.length > 0 ? (
        <View style={styles.quickBlock}>
          <Text style={styles.quickTitle}>Quick status</Text>
          <Text style={styles.quickHint}>Selects status only. Save Status to apply.</Text>
          <View style={styles.quickRow}>
            {summary.quickStatuses.map(option => (
              <Pressable
                key={option}
                style={styles.quickChip}
                accessibilityRole="button"
                accessibilityLabel={`Select status ${option}`}
                onPress={() => {
                  onSelectQuickStatus(option as LeadStatusValue);
                }}
              >
                <Text style={styles.quickChipText}>{option}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginBottom: 16,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 14,
    gap: 8
  },
  recommendation: {
    color: colors.text,
    fontSize: 17,
    fontWeight: "800",
    lineHeight: 24
  },
  stageHint: {
    color: colors.textSoft,
    fontSize: 14,
    lineHeight: 20
  },
  activity: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 18
  },
  ctaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginTop: 4
  },
  quickBlock: { marginTop: 8, gap: 6 },
  quickTitle: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.4,
    textTransform: "uppercase"
  },
  quickHint: { color: colors.textMuted, fontSize: 12, lineHeight: 16 },
  quickRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  quickChip: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    backgroundColor: colors.bg,
    paddingHorizontal: 10,
    paddingVertical: 8,
    minHeight: 36,
    justifyContent: "center"
  },
  quickChipText: { color: colors.textSoft, fontWeight: "700", fontSize: 12 }
});
