import { Pressable, StyleSheet, Text, View } from "react-native";

import { colors } from "@/constants/theme";
import type { LeadStatusValue } from "@/constants/leadStatus";
import type { Remark, TimelineEvent } from "@/types";
import { getLeadIntelligence } from "@/utils/leadIntelligence";
import { getPipelineConversionContext } from "@/utils/pipeline";

interface LeadIntelligenceSummaryProps {
  status: string;
  name: string;
  phone: string;
  email: string;
  telHref: string | null;
  mailtoHref: string | null;
  timelineEvents: TimelineEvent[];
  remarks: Remark[];
  onSelectNextStage?: (status: LeadStatusValue) => void;
}

export function LeadIntelligenceSummary({
  status,
  name,
  phone,
  email,
  telHref,
  mailtoHref,
  timelineEvents,
  remarks,
  onSelectNextStage
}: LeadIntelligenceSummaryProps) {
  const intelligence = getLeadIntelligence({
    status,
    name,
    phone,
    email,
    telHref,
    mailtoHref,
    timelineEvents,
    remarks
  });
  const pipeline = getPipelineConversionContext(status);

  const { progress, readiness, stageSummary, signals, missing, activity, remarks: remarkInfo } =
    intelligence;

  return (
    <View style={styles.wrap} accessibilityLabel="Lead intelligence summary">
      <Text style={styles.eyebrow}>Lead Intelligence</Text>
      <Text style={styles.readiness} accessibilityLabel={`Conversion readiness ${readiness}`}>
        {readiness}
      </Text>
      <Text style={styles.stageSummary}>{stageSummary}</Text>

      <View style={styles.pipelineContext}>
        <SignalRow label="Current Stage" value={pipeline.currentStage} />
        <SignalRow label="Readiness" value={readiness} />
        <SignalRow
          label={pipeline.nextStage ? "Typical next stage" : "Next stage"}
          value={pipeline.nextStageLabel}
        />
      </View>

      {pipeline.moveToLabel && pipeline.nextStage && onSelectNextStage ? (
        <View style={styles.moveBlock}>
          <Pressable
            style={styles.moveBtn}
            accessibilityRole="button"
            accessibilityLabel={pipeline.moveToLabel}
            onPress={() => {
              onSelectNextStage(pipeline.nextStage as LeadStatusValue);
            }}
          >
            <Text style={styles.moveBtnText}>{pipeline.moveToLabel}</Text>
          </Pressable>
          <Text style={styles.moveHint}>Selects next stage. Save Status to apply.</Text>
        </View>
      ) : null}

      {progress.kind === "unknown" ? (
        <Text style={styles.unavailable}>{progress.unavailableLabel}</Text>
      ) : null}

      {progress.kind === "terminal" ? (
        <View style={styles.terminalBox}>
          <Text style={styles.terminalLabel}>Current stage</Text>
          <Text style={styles.terminalValue}>{progress.terminalStatus}</Text>
        </View>
      ) : null}

      {progress.kind === "progress" ? (
        <View style={styles.stages} accessibilityLabel="Conversion progress">
          {progress.stages.map((stage, index) => {
            const active = index === progress.currentIndex;
            const reached = index <= progress.currentIndex;
            return (
              <View key={stage} style={styles.stageRow}>
                <Text
                  style={[
                    styles.stageMark,
                    reached && styles.stageMarkReached,
                    active && styles.stageMarkActive
                  ]}
                  accessibilityLabel={active ? `Current stage ${stage}` : stage}
                >
                  {active ? "●" : reached ? "●" : "○"}
                </Text>
                <Text style={[styles.stageText, active && styles.stageTextActive]}>{stage}</Text>
              </View>
            );
          })}
        </View>
      ) : null}

      <View style={styles.signalGrid}>
        <SignalRow label="Lead" value={intelligence.displayName} />
        <SignalRow label="Phone" value={signals.phoneAvailable ? "Available" : "Not available"} />
        <SignalRow label="Email" value={signals.emailAvailable ? "Available" : "Not available"} />
        <SignalRow label="Activity" value={activity.summary} />
        <SignalRow label="Remarks" value={remarkInfo.summary} />
      </View>

      <View style={styles.missingBlock}>
        <Text style={styles.missingTitle}>Contact quality</Text>
        <Text style={styles.missingSummary}>{missing.summary}</Text>
        {!missing.contactComplete
          ? missing.items.map(item => (
              <Text key={item} style={styles.missingItem}>
                {item}
              </Text>
            ))
          : null}
      </View>
    </View>
  );
}

function SignalRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.signalRow}>
      <Text style={styles.signalLabel}>{label}</Text>
      <Text style={styles.signalValue}>{value}</Text>
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
  eyebrow: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.4,
    textTransform: "uppercase"
  },
  readiness: {
    color: colors.accent,
    fontSize: 16,
    fontWeight: "800"
  },
  stageSummary: {
    color: colors.textSoft,
    fontSize: 14,
    lineHeight: 20
  },
  pipelineContext: {
    marginTop: 2,
    gap: 6
  },
  moveBlock: {
    gap: 4,
    marginTop: 2
  },
  moveBtn: {
    alignSelf: "flex-start",
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.accent,
    borderRadius: 10,
    minHeight: 40,
    paddingHorizontal: 12,
    justifyContent: "center"
  },
  moveBtnText: {
    color: colors.accent,
    fontWeight: "800",
    fontSize: 13
  },
  moveHint: {
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 16
  },
  unavailable: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: "700",
    marginTop: 4
  },
  terminalBox: {
    marginTop: 4,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: 10,
    padding: 12,
    backgroundColor: colors.bg
  },
  terminalLabel: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.4
  },
  terminalValue: {
    marginTop: 4,
    color: colors.text,
    fontSize: 16,
    fontWeight: "800"
  },
  stages: {
    marginTop: 4,
    gap: 6
  },
  stageRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10
  },
  stageMark: {
    width: 16,
    color: colors.textMuted,
    fontSize: 14,
    fontWeight: "700"
  },
  stageMarkReached: {
    color: colors.accent
  },
  stageMarkActive: {
    color: colors.accent
  },
  stageText: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: "600"
  },
  stageTextActive: {
    color: colors.text,
    fontWeight: "800"
  },
  signalGrid: {
    marginTop: 6,
    gap: 6
  },
  signalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12
  },
  signalLabel: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: "700",
    minWidth: 90
  },
  signalValue: {
    flex: 1,
    color: colors.textSoft,
    fontSize: 13,
    fontWeight: "600",
    textAlign: "right"
  },
  missingBlock: {
    marginTop: 6,
    gap: 4
  },
  missingTitle: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.4,
    textTransform: "uppercase"
  },
  missingSummary: {
    color: colors.textSoft,
    fontSize: 13,
    lineHeight: 18
  },
  missingItem: {
    color: colors.danger,
    fontSize: 13,
    lineHeight: 18
  }
});
