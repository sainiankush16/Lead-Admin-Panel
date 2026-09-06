import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { colors } from "@/constants/theme";

export interface UserFormValues {
  name: string;
  loginId: string;
  password: string;
  confirmPassword: string;
}

interface UserFormProps {
  values: UserFormValues;
  error: string | null;
  busy: boolean;
  submitLabel: string;
  onChange: (next: UserFormValues) => void;
  onCancel: () => void;
  onSubmit: () => void;
}

export function UserForm({
  values,
  error,
  busy,
  submitLabel,
  onChange,
  onCancel,
  onSubmit
}: UserFormProps) {
  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>Add User</Text>
      <Text style={styles.hint}>Creates a Project User. Passwords are never shown again.</Text>

      <Text style={styles.label}>Name</Text>
      <TextInput
        style={styles.input}
        value={values.name}
        onChangeText={name => onChange({ ...values, name })}
        placeholder="Display name"
        placeholderTextColor={colors.textMuted}
        editable={!busy}
        autoCapitalize="words"
      />

      <Text style={styles.label}>Login ID</Text>
      <TextInput
        style={styles.input}
        value={values.loginId}
        onChangeText={loginId => onChange({ ...values, loginId })}
        placeholder="login.id"
        placeholderTextColor={colors.textMuted}
        autoCapitalize="none"
        autoCorrect={false}
        editable={!busy}
        accessibilityLabel="Login ID"
      />

      <Text style={styles.label}>Password</Text>
      <TextInput
        style={styles.input}
        value={values.password}
        onChangeText={password => onChange({ ...values, password })}
        placeholder="At least 8 characters"
        placeholderTextColor={colors.textMuted}
        secureTextEntry
        editable={!busy}
        accessibilityLabel="Password"
      />

      <Text style={styles.label}>Confirm Password</Text>
      <TextInput
        style={styles.input}
        value={values.confirmPassword}
        onChangeText={confirmPassword => onChange({ ...values, confirmPassword })}
        placeholder="Confirm password"
        placeholderTextColor={colors.textMuted}
        secureTextEntry
        editable={!busy}
        accessibilityLabel="Confirm password"
      />

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <View style={styles.actions}>
        <Pressable
          style={styles.secondary}
          disabled={busy}
          accessibilityRole="button"
          accessibilityLabel="Cancel"
          onPress={onCancel}
        >
          <Text style={styles.secondaryText}>Cancel</Text>
        </Pressable>
        <Pressable
          style={[styles.primary, busy && styles.disabled]}
          disabled={busy}
          accessibilityRole="button"
          accessibilityLabel={busy ? "Saving" : submitLabel}
          onPress={onSubmit}
        >
          <Text style={styles.primaryText}>{busy ? "Saving..." : submitLabel}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderWidth: 1,
    borderColor: colors.cardBorder,
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    gap: 6
  },
  title: { color: colors.text, fontSize: 18, fontWeight: "800", marginBottom: 4 },
  hint: { color: colors.textMuted, fontSize: 13, marginBottom: 8, lineHeight: 18 },
  label: { color: colors.textMuted, fontSize: 12, fontWeight: "700", marginTop: 8 },
  input: {
    minHeight: 44,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    backgroundColor: colors.bg,
    color: colors.text,
    paddingHorizontal: 12,
    fontSize: 15
  },
  error: { color: colors.danger, marginTop: 8, fontSize: 13 },
  actions: { flexDirection: "row", justifyContent: "flex-end", gap: 10, marginTop: 14 },
  primary: {
    backgroundColor: colors.accent,
    borderRadius: 10,
    minHeight: 44,
    paddingHorizontal: 14,
    alignItems: "center",
    justifyContent: "center"
  },
  primaryText: { color: colors.bg, fontWeight: "800" },
  secondary: {
    borderRadius: 10,
    minHeight: 44,
    paddingHorizontal: 14,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.cardBorder
  },
  secondaryText: { color: colors.textSoft, fontWeight: "700" },
  disabled: { opacity: 0.45 }
});
