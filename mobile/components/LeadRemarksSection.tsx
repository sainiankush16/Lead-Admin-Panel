import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View
} from "react-native";

import { ActionButton } from "@/components/ui/ActionButton";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { colors } from "@/constants/theme";
import type { Remark, User } from "@/types";
import {
  canMutateRemark,
  canSubmitRemarkDraft,
  formatRemarkTimestamp,
  MAX_REMARK_LENGTH,
  remarkAuthorLabel,
  validateRemarkDraft
} from "@/utils/leadRemarks";

type ComposerMode = "closed" | "add" | "edit";

interface LeadRemarksSectionProps {
  remarks: Remark[];
  loading: boolean;
  error: string | null;
  busy: boolean;
  user: User | null;
  onRetry: () => void;
  onAdd: (body: string) => Promise<void>;
  onEdit: (remarkId: number, body: string) => Promise<void>;
  onDelete: (remarkId: number) => Promise<void>;
}

export function LeadRemarksSection({
  remarks,
  loading,
  error,
  busy,
  user,
  onRetry,
  onAdd,
  onEdit,
  onDelete
}: LeadRemarksSectionProps) {
  const [mode, setMode] = useState<ComposerMode>("closed");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [draft, setDraft] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);

  const submitEnabled = canSubmitRemarkDraft({ draft, busy });

  function openAdd() {
    setMode("add");
    setEditingId(null);
    setDraft("");
    setLocalError(null);
  }

  function openEdit(remark: Remark) {
    setMode("edit");
    setEditingId(remark.id);
    setDraft(remark.body);
    setLocalError(null);
  }

  function closeComposer() {
    if (busy) return;
    setMode("closed");
    setEditingId(null);
    setDraft("");
    setLocalError(null);
  }

  async function onSave() {
    const validated = validateRemarkDraft(draft);
    if (!validated.ok) {
      setLocalError(validated.error);
      return;
    }
    setLocalError(null);
    try {
      if (mode === "add") {
        await onAdd(validated.value);
      } else if (mode === "edit" && editingId != null) {
        await onEdit(editingId, validated.value);
      }
      setMode("closed");
      setEditingId(null);
      setDraft("");
    } catch {
      // Parent sets mutation error; keep composer open.
    }
  }

  function confirmDelete(remark: Remark) {
    Alert.alert("Delete this remark?", "This cannot be undone from the mobile app.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => {
          void onDelete(remark.id);
        }
      }
    ]);
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={styles.wrap}
    >
      <SectionHeader title="Remarks" icon="note" />

      {loading ? (
        <View style={styles.loadingRow}>
          <ActivityIndicator color={colors.accent} />
          <Text style={styles.muted}>Loading remarks...</Text>
        </View>
      ) : null}

      {!loading && error ? (
        <View style={styles.errorBlock}>
          <Text style={styles.errorText}>{error}</Text>
          <Pressable
            style={styles.secondaryBtn}
            accessibilityRole="button"
            accessibilityLabel="Retry loading remarks"
            onPress={onRetry}
          >
            <Text style={styles.secondaryBtnText}>Retry</Text>
          </Pressable>
        </View>
      ) : null}

      {!loading && !error && remarks.length === 0 && mode === "closed" ? (
        <Text style={styles.muted}>No remarks yet.</Text>
      ) : null}

      {!loading && !error
        ? remarks.map(remark => {
            const editable = canMutateRemark(user, remark);
            const isEditing = mode === "edit" && editingId === remark.id;
            if (isEditing) return null;
            return (
              <View key={remark.id} style={styles.card}>
                <Text style={styles.author}>{remarkAuthorLabel(remark)}</Text>
                <Text style={styles.body}>{remark.body}</Text>
                <Text style={styles.timestamp}>{formatRemarkTimestamp(remark.createdAt)}</Text>
                {editable ? (
                  <View style={styles.cardActions}>
                    <ActionButton
                      label="Edit"
                      icon="edit"
                      variant="ghost"
                      compact
                      disabled={busy || mode !== "closed"}
                      accessibilityLabel="Edit remark"
                      onPress={() => openEdit(remark)}
                    />
                    <ActionButton
                      label="Delete"
                      icon="delete"
                      variant="danger"
                      compact
                      disabled={busy || mode !== "closed"}
                      accessibilityLabel="Delete remark"
                      onPress={() => confirmDelete(remark)}
                    />
                  </View>
                ) : null}
              </View>
            );
          })
        : null}

      {mode === "closed" ? (
        <ActionButton
          label="Add Remark"
          icon="add"
          variant="primary"
          disabled={busy || loading}
          accessibilityLabel="Add Remark"
          onPress={openAdd}
        />
      ) : (
        <View style={styles.composer}>
          <Text style={styles.composerTitle}>{mode === "add" ? "Add Remark" : "Edit Remark"}</Text>
          <TextInput
            style={styles.input}
            value={draft}
            onChangeText={text => {
              setDraft(text);
              setLocalError(null);
            }}
            placeholder="Enter your remark..."
            placeholderTextColor={colors.textMuted}
            multiline
            textAlignVertical="top"
            maxLength={MAX_REMARK_LENGTH}
            editable={!busy}
            autoFocus
          />
          {localError ? <Text style={styles.errorText}>{localError}</Text> : null}
          <View style={styles.composerActions}>
            <ActionButton
              label="Cancel"
              icon="clear"
              variant="ghost"
              compact
              disabled={busy}
              accessibilityLabel="Cancel remark"
              onPress={closeComposer}
            />
            <ActionButton
              label={mode === "add" ? "Save Remark" : "Save Changes"}
              icon="save"
              variant="primary"
              compact
              disabled={!submitEnabled}
              busy={busy}
              accessibilityLabel={
                busy ? "Saving remark" : mode === "add" ? "Save Remark" : "Save Changes"
              }
              onPress={() => {
                void onSave();
              }}
            />
          </View>
        </View>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: 24, marginBottom: 8 },
  title: {
    color: colors.text,
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 12
  },
  loadingRow: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 12 },
  muted: { color: colors.textMuted, fontSize: 14, marginBottom: 12 },
  errorBlock: { marginBottom: 12, gap: 8 },
  errorText: { color: colors.danger, fontSize: 13 },
  card: {
    borderWidth: 1,
    borderColor: colors.cardBorder,
    backgroundColor: colors.card,
    borderRadius: 10,
    padding: 14,
    marginBottom: 10
  },
  author: { color: colors.text, fontWeight: "700", fontSize: 14, marginBottom: 6 },
  body: { color: colors.textSoft, fontSize: 15, lineHeight: 22 },
  timestamp: { marginTop: 8, color: colors.textMuted, fontSize: 12 },
  cardActions: { flexDirection: "row", gap: 16, marginTop: 12 },
  linkAction: { color: colors.accent, fontWeight: "700", fontSize: 14 },
  dangerAction: { color: colors.danger, fontWeight: "700", fontSize: 14 },
  addBtn: {
    alignSelf: "flex-start",
    minHeight: 44,
    justifyContent: "center",
    paddingHorizontal: 4,
    marginTop: 4
  },
  addBtnText: { color: colors.accent, fontWeight: "800", fontSize: 15 },
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
  composerActions: { flexDirection: "row", justifyContent: "flex-end", gap: 10 },
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
  disabled: { opacity: 0.4 }
});
