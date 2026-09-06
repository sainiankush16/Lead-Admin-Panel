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
  applyContactQuickRemark,
  canSubmitContactRemark,
  contactQuickRemarkSuggestions,
  validateContactRemarkDraft
} from "@/utils/leadContactActivity";

interface LeadContactRemarkSectionProps {
  busy: boolean;
  message: string | null;
  error: string | null;
  onAdd: (body: string) => Promise<void>;
}

export function LeadContactRemarkSection({
  busy,
  message,
  error,
  onAdd
}: LeadContactRemarkSectionProps) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);
  const suggestions = contactQuickRemarkSuggestions();
  const submitEnabled = canSubmitContactRemark({ draft, busy });

  function openComposer() {
    if (busy) return;
    setOpen(true);
    setDraft("");
    setLocalError(null);
  }

  function closeComposer() {
    if (busy) return;
    setOpen(false);
    setDraft("");
    setLocalError(null);
  }

  function chooseSuggestion(suggestion: string) {
    if (busy) return;
    setDraft(applyContactQuickRemark(suggestion, draft));
    setLocalError(null);
    if (!open) setOpen(true);
  }

  async function onSave() {
    const validated = validateContactRemarkDraft(draft);
    if (!validated.ok) {
      setLocalError(validated.error);
      return;
    }
    setLocalError(null);
    try {
      await onAdd(validated.value);
      setOpen(false);
      setDraft("");
    } catch {
      // Parent keeps mutation error; leave composer open for retry.
    }
  }

  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>Contact Remark</Text>
      <Text style={styles.hint}>Record the outcome after a call, WhatsApp, or email.</Text>

      {open ? (
        <View style={styles.composer}>
          <Text style={styles.composerTitle}>Add Contact Remark</Text>
          <View style={styles.suggestions}>
            {suggestions.map(item => (
              <Pressable
                key={item}
                style={[styles.chip, busy && styles.disabled]}
                disabled={busy}
                accessibilityRole="button"
                accessibilityLabel={`Use quick remark ${item}`}
                onPress={() => chooseSuggestion(item)}
              >
                <Text style={styles.chipText}>{item}</Text>
              </Pressable>
            ))}
          </View>
          <TextInput
            style={styles.input}
            value={draft}
            onChangeText={text => {
              setDraft(text);
              setLocalError(null);
            }}
            placeholder="Describe what happened..."
            placeholderTextColor={colors.textMuted}
            multiline
            textAlignVertical="top"
            maxLength={MAX_REMARK_LENGTH}
            editable={!busy}
            autoFocus
          />
          {localError ? <Text style={styles.error}>{localError}</Text> : null}
          <View style={styles.row}>
            <Pressable
              style={[styles.secondaryBtn, busy && styles.disabled]}
              disabled={busy}
              accessibilityRole="button"
              accessibilityLabel="Cancel contact remark"
              onPress={closeComposer}
            >
              <Text style={styles.secondaryBtnText}>Cancel</Text>
            </Pressable>
            <Pressable
              style={[styles.primaryBtn, !submitEnabled && styles.disabled]}
              disabled={!submitEnabled}
              accessibilityRole="button"
              accessibilityLabel={busy ? "Saving contact remark" : "Save Contact Remark"}
              accessibilityState={{ disabled: !submitEnabled, busy }}
              onPress={() => {
                void onSave();
              }}
            >
              {busy ? (
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
          style={[styles.linkBtn, busy && styles.disabled]}
          disabled={busy}
          accessibilityRole="button"
          accessibilityLabel="Add Contact Remark"
          onPress={openComposer}
        >
          <Text style={styles.linkBtnText}>Add Contact Remark</Text>
        </Pressable>
      )}

      {message ? <Text style={styles.success}>{message}</Text> : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: 20 },
  title: {
    color: colors.text,
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 6
  },
  hint: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 10
  },
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
  suggestions: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    borderWidth: 1,
    borderColor: colors.cardBorder,
    backgroundColor: colors.bg,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8
  },
  chipText: { color: colors.textSoft, fontSize: 12, fontWeight: "600" },
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
  row: { flexDirection: "row", justifyContent: "flex-end", gap: 10 },
  primaryBtn: {
    backgroundColor: colors.accent,
    borderRadius: 10,
    minHeight: 44,
    paddingHorizontal: 14,
    alignItems: "center",
    justifyContent: "center"
  },
  primaryBtnText: { color: colors.bg, fontWeight: "800", fontSize: 14 },
  secondaryBtn: {
    borderRadius: 10,
    minHeight: 44,
    paddingHorizontal: 14,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.cardBorder,
    backgroundColor: colors.bg
  },
  secondaryBtnText: { color: colors.textSoft, fontWeight: "700", fontSize: 14 },
  saveRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  success: { marginTop: 10, color: colors.accent, fontSize: 13, fontWeight: "600" },
  error: { marginTop: 8, color: colors.danger, fontSize: 13 },
  disabled: { opacity: 0.4 }
});
