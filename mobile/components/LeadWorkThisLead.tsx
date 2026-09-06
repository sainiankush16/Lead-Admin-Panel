import { Pressable, StyleSheet, Text, View } from "react-native";

import { colors } from "@/constants/theme";
import { buildWorkThisLeadSummary } from "@/utils/leadWorkspace";
import { openCall, openEmail } from "@/utils/linking";
import type { Remark, TimelineEvent } from "@/types";

interface LeadWorkThisLeadProps {
  projectName: string;
  status: string;
  telHref: string | null;
  mailtoHref: string | null;
  timelineEvents: TimelineEvent[];
  remarks: Remark[];
  onReview: () => void;
  onJumpToRemarks: () => void;
}

export function LeadWorkThisLead({
  projectName,
  status,
  telHref,
  mailtoHref,
  timelineEvents,
  remarks,
  onReview,
  onJumpToRemarks
}: LeadWorkThisLeadProps) {
  const summary = buildWorkThisLeadSummary({
    projectName,
    status,
    telHref,
    mailtoHref,
    timelineEvents,
    remarks
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
    onReview();
  }

  const primaryDisabled = summary.primaryAction.type === "none";

  return (
    <View style={styles.wrap} accessibilityLabel="Work this lead">
      <Text style={styles.title}>{summary.title}</Text>
      <Text style={styles.project}>{summary.projectName}</Text>

      <Row label={summary.currentLabel} value={summary.currentValue} />
      <Row label={summary.nextLabel} value={summary.nextValue} />
      <Row label={summary.contactLabel} value={summary.contactValue} />
      <Row label={summary.activityLabel} value={summary.activityValue} />
      <Row label={summary.remarksLabel} value={summary.remarksValue} />

      <Text style={styles.recommendation}>{summary.recommendation}</Text>

      <View style={styles.actions}>
        <Pressable
          style={[styles.primaryBtn, primaryDisabled && styles.disabled]}
          disabled={primaryDisabled}
          accessibilityRole="button"
          accessibilityLabel={summary.primaryAction.label}
          accessibilityState={{ disabled: primaryDisabled }}
          onPress={runPrimary}
        >
          <Text style={styles.primaryBtnText}>{summary.primaryAction.label}</Text>
        </Pressable>
        <Pressable
          style={styles.secondaryBtn}
          accessibilityRole="button"
          accessibilityLabel="Add remark"
          onPress={onJumpToRemarks}
        >
          <Text style={styles.secondaryBtnText}>Add Remark</Text>
        </Pressable>
      </View>
      <Text style={styles.hint}>Status changes require Save Status. Contact does not auto-update status.</Text>
    </View>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginBottom: 16,
    borderWidth: 1,
    borderColor: colors.accent,
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 14,
    gap: 6
  },
  title: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "800"
  },
  project: {
    color: colors.textSoft,
    fontSize: 13,
    marginBottom: 4
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12
  },
  rowLabel: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: "700",
    minWidth: 72
  },
  rowValue: {
    flex: 1,
    color: colors.textSoft,
    fontSize: 13,
    fontWeight: "600",
    textAlign: "right"
  },
  recommendation: {
    marginTop: 6,
    color: colors.accent,
    fontSize: 14,
    fontWeight: "700"
  },
  actions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 4
  },
  primaryBtn: {
    backgroundColor: colors.accent,
    borderRadius: 10,
    minHeight: 44,
    paddingHorizontal: 14,
    justifyContent: "center"
  },
  primaryBtnText: {
    color: colors.bg,
    fontWeight: "800",
    fontSize: 14
  },
  secondaryBtn: {
    borderRadius: 10,
    minHeight: 44,
    paddingHorizontal: 14,
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.cardBorder,
    backgroundColor: colors.bg
  },
  secondaryBtnText: {
    color: colors.textSoft,
    fontWeight: "700",
    fontSize: 14
  },
  hint: {
    marginTop: 4,
    color: colors.textMuted,
    fontSize: 11,
    lineHeight: 15
  },
  disabled: { opacity: 0.45 }
});
