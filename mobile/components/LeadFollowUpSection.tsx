import { useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View
} from "react-native";

import { colors } from "@/constants/theme";
import { MAX_REMARK_LENGTH } from "@/utils/leadRemarks";
import {
  canEnableMarkFollowUp,
  canSubmitFollowUpRemark,
  followUpConfirmationCopy,
  isFollowUpStatus,
  validateFollowUpRemarkDraft
} from "@/utils/leadFollowUp";
import { followUpActiveGuidance } from "@/utils/leadProductivity";

interface LeadFollowUpSectionProps {
  displayStatus: string;
  statusSaving: boolean;
  remarkBusy: boolean;
  statusMessage: string | null;
  statusError: string | null;
  remarkMessage: string | null;
  remarkError: string | null;
  onMarkFollowUp: () => Promise<void>;
  onAddFollowUpRemark: (body: string) => Promise<void>;
  onRetryStatus?: () => void;
}

export function LeadFollowUpSection({
  displayStatus,
  statusSaving,
  remarkBusy,
  statusMessage,
  statusError,
  remarkMessage,
  remarkError,
  onMarkFollowUp,
  onAddFollowUpRemark,
  onRetryStatus
}: LeadFollowUpSectionProps) {
  const [confirming, setConfirming] = useState(false);
  const [remarkOpen, setRemarkOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [localRemarkError, setLocalRemarkError] = useState<string | null>(null);

  const alreadyFollowUp = isFollowUpStatus(displayStatus);
  const canMark = canEnableMarkFollowUp({
    displayStatus,
    saving: statusSaving
  });
  const confirmCopy = followUpConfirmationCopy();
  const remarkSubmitEnabled = canSubmitFollowUpRemark({ draft, busy: remarkBusy });

  function openConfirm() {
    if (!canMark || statusSaving) return;
    setConfirming(true);
  }

  function cancelConfirm() {
    if (statusSaving) return;
    setConfirming(false);
  }

  async function confirmMark() {
    if (!canMark || statusSaving) return;
    try {
      await onMarkFollowUp();
      setConfirming(false);
    } catch {
      // Parent keeps error; stay on confirm so user can retry or cancel.
    }
  }

  function openRemark() {
    if (remarkBusy) return;
    setRemarkOpen(true);
    setDraft("");
    setLocalRemarkError(null);
  }

  function closeRemark() {
    if (remarkBusy) return;
    setRemarkOpen(false);
    setDraft("");
    setLocalRemarkError(null);
  }

  async function submitRemark() {
    const validated = validateFollowUpRemarkDraft(draft);
    if (!validated.ok) {
      setLocalRemarkError(validated.error);
      return;
    }
    setLocalRemarkError(null);
    try {
      await onAddFollowUpRemark(validated.value);
      setRemarkOpen(false);
      setDraft("");
    } catch {
      // Parent sets mutation error; keep composer open.
    }
  }

  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>Follow-Up</Text>
      <Text style={styles.guidance}>
        Mark Follow Up when this lead needs continued attention. No dates or reminders — status only.
      </Text>

      {alreadyFollowUp ? (
        <View style={styles.infoCard}>
          <Text style={styles.infoLabel}>Status</Text>
          <Text style={styles.infoValue}>Follow Up</Text>
          <Text style={styles.infoNote}>{followUpActiveGuidance()}</Text>
        </View>
      ) : confirming ? (
        <View style={styles.confirmCard}>
          <Text style={styles.confirmTitle}>{confirmCopy.title}</Text>
          <View style={styles.row}>
            <Pressable
              style={[styles.secondaryBtn, statusSaving && styles.disabled]}
              disabled={statusSaving}
              accessibilityRole="button"
              accessibilityLabel="Cancel follow-up"
              onPress={cancelConfirm}
            >
              <Text style={styles.secondaryBtnText}>{confirmCopy.cancel}</Text>
            </Pressable>
            <Pressable
              style={[styles.primaryBtn, statusSaving && styles.disabled]}
              disabled={statusSaving}
              accessibilityRole="button"
              accessibilityLabel={statusSaving ? "Saving follow-up" : "Mark Follow Up"}
              accessibilityState={{ busy: statusSaving, disabled: statusSaving }}
              onPress={() => {
                void confirmMark();
              }}
            >
              {statusSaving ? (
                <View style={styles.saveRow}>
                  <ActivityIndicator color={colors.bg} />
                  <Text style={styles.primaryBtnText}>Saving...</Text>
                </View>
              ) : (
                <Text style={styles.primaryBtnText}>{confirmCopy.confirm}</Text>
              )}
            </Pressable>
          </View>
        </View>
      ) : (
        <Pressable
          style={[styles.primaryBtn, !canMark && styles.disabled]}
          disabled={!canMark}
          accessibilityRole="button"
          accessibilityLabel="Follow Up"
          accessibilityState={{ disabled: !canMark, busy: statusSaving }}
          onPress={openConfirm}
        >
          <Text style={styles.primaryBtnText}>Follow Up</Text>
        </Pressable>
      )}

      {statusMessage ? <Text style={styles.success}>{statusMessage}</Text> : null}
      {statusError ? (
        <View style={styles.errorBlock}>
          <Text style={styles.error}>{statusError}</Text>
          {onRetryStatus ? (
            <Pressable
              style={styles.secondaryBtn}
              disabled={statusSaving}
              accessibilityRole="button"
              accessibilityLabel="Retry follow-up"
              onPress={onRetryStatus}
            >
              <Text style={styles.secondaryBtnText}>Retry</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      <Text style={styles.subtitle}>Follow-up remark</Text>
      {remarkOpen ? (
        <View style={styles.composer}>
          <Text style={styles.composerTitle}>Add Follow-Up Remark</Text>
          <TextInput
            style={styles.input}
            value={draft}
            onChangeText={text => {
              setDraft(text);
              setLocalRemarkError(null);
            }}
            placeholder="Describe the follow-up action..."
            placeholderTextColor={colors.textMuted}
            multiline
            textAlignVertical="top"
            maxLength={MAX_REMARK_LENGTH}
            editable={!remarkBusy}
            autoFocus
          />
          {localRemarkError ? <Text style={styles.error}>{localRemarkError}</Text> : null}
          <View style={styles.row}>
            <Pressable
              style={[styles.secondaryBtn, remarkBusy && styles.disabled]}
              disabled={remarkBusy}
              accessibilityRole="button"
              accessibilityLabel="Cancel follow-up remark"
              onPress={closeRemark}
            >
              <Text style={styles.secondaryBtnText}>Cancel</Text>
            </Pressable>
            <Pressable
              style={[styles.primaryBtn, !remarkSubmitEnabled && styles.disabled]}
              disabled={!remarkSubmitEnabled}
              accessibilityRole="button"
              accessibilityLabel={remarkBusy ? "Saving follow-up remark" : "Save Follow-Up Remark"}
              accessibilityState={{ disabled: !remarkSubmitEnabled, busy: remarkBusy }}
              onPress={() => {
                void submitRemark();
              }}
            >
              {remarkBusy ? (
                <View style={styles.saveRow}>
                  <ActivityIndicator color={colors.bg} />
                  <Text style={styles.primaryBtnText}>Saving...</Text>
                </View>
              ) : (
                <Text style={styles.primaryBtnText}>Save Remark</Text>
              )}
            </Pressable>
          </View>
        </View>
      ) : (
        <Pressable
          style={[styles.linkBtn, remarkBusy && styles.disabled]}
          disabled={remarkBusy}
          accessibilityRole="button"
          accessibilityLabel="Add Follow-Up Remark"
          onPress={openRemark}
        >
          <Text style={styles.linkBtnText}>Add Follow-Up Remark</Text>
        </Pressable>
      )}

      {remarkMessage ? <Text style={styles.success}>{remarkMessage}</Text> : null}
      {remarkError ? <Text style={styles.error}>{remarkError}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: 20 },
  title: {
    color: colors.text,
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 8
  },
  guidance: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 12
  },
  subtitle: {
    marginTop: 16,
    marginBottom: 8,
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0.4,
    textTransform: "uppercase"
  },
  infoCard: {
    borderWidth: 1,
    borderColor: colors.cardBorder,
    backgroundColor: colors.card,
    borderRadius: 10,
    padding: 14
  },
  infoLabel: { color: colors.textMuted, fontSize: 12, fontWeight: "700" },
  infoValue: { marginTop: 4, color: colors.accent, fontSize: 16, fontWeight: "800" },
  infoNote: { marginTop: 8, color: colors.textSoft, fontSize: 14, lineHeight: 20 },
  confirmCard: {
    borderWidth: 1,
    borderColor: colors.cardBorder,
    backgroundColor: colors.card,
    borderRadius: 10,
    padding: 14,
    gap: 12
  },
  confirmTitle: { color: colors.text, fontSize: 15, fontWeight: "700", lineHeight: 22 },
  row: { flexDirection: "row", justifyContent: "flex-end", gap: 10 },
  primaryBtn: {
    backgroundColor: colors.accent,
    borderRadius: 10,
    minHeight: 48,
    paddingHorizontal: 16,
    alignItems: "center",
    justifyContent: "center"
  },
  primaryBtnText: { color: colors.bg, fontWeight: "800", fontSize: 15 },
  secondaryBtn: {
    borderRadius: 10,
    minHeight: 48,
    paddingHorizontal: 14,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.cardBorder,
    backgroundColor: colors.bg
  },
  secondaryBtnText: { color: colors.textSoft, fontWeight: "700", fontSize: 14 },
  linkBtn: {
    alignSelf: "flex-start",
    minHeight: 44,
    justifyContent: "center",
    paddingHorizontal: 2
  },
  linkBtnText: { color: colors.accent, fontWeight: "800", fontSize: 15 },
  composer: {
    borderWidth: 1,
    borderColor: colors.cardBorder,
    backgroundColor: colors.card,
    borderRadius: 10,
    padding: 14,
    gap: 10
  },
  composerTitle: { color: colors.text, fontWeight: "700", fontSize: 15 },
  input: {
    minHeight: 110,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: 8,
    padding: 12,
    color: colors.text,
    fontSize: 15,
    lineHeight: 22,
    backgroundColor: colors.bg
  },
  success: { marginTop: 10, color: colors.accent, fontSize: 13, fontWeight: "600" },
  error: { marginTop: 10, color: colors.danger, fontSize: 13 },
  errorBlock: { marginTop: 10, gap: 8 },
  saveRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  disabled: { opacity: 0.4 }
});
