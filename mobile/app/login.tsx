import { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View
} from "react-native";
import { Redirect } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";

import { BRAND_NAME, BRAND_TAGLINE } from "@/constants/branding";
import { useAuth } from "@/hooks/useAuth";

export default function LoginScreen() {
  const { status, login, error, sessionExpiredMessage, clearError } = useAuth();
  const [loginId, setLoginId] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  if (status === "authenticated") {
    return <Redirect href="/" />;
  }

  async function onSubmit() {
    if (submitting) return;
    clearError();
    setSubmitting(true);
    try {
      await login(loginId.trim(), password);
    } catch {
      // Error message is set in AuthProvider.
    } finally {
      setSubmitting(false);
    }
  }

  const message = error || sessionExpiredMessage;

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={styles.container}>
          <Text style={styles.brand}>{BRAND_NAME}</Text>
          <Text style={styles.tagline}>{BRAND_TAGLINE}</Text>
          <Text style={styles.subtitle}>Sign in with your Login ID</Text>

          <View style={styles.form}>
            <Text style={styles.label}>Login ID</Text>
            <TextInput
              style={styles.input}
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="username"
              textContentType="username"
              value={loginId}
              onChangeText={setLoginId}
              editable={!submitting}
              placeholder="your.login.id"
              placeholderTextColor="#64748B"
            />

            <Text style={styles.label}>Password</Text>
            <TextInput
              style={styles.input}
              secureTextEntry
              autoCapitalize="none"
              autoComplete="password"
              textContentType="password"
              value={password}
              onChangeText={setPassword}
              editable={!submitting}
              placeholder="Password"
              placeholderTextColor="#64748B"
              onSubmitEditing={() => {
                void onSubmit();
              }}
            />

            {message ? <Text style={styles.error}>{message}</Text> : null}

            <Pressable
              style={[styles.button, submitting && styles.buttonDisabled]}
              disabled={submitting}
              onPress={() => {
                void onSubmit();
              }}
            >
              {submitting ? (
                <ActivityIndicator color="#0F172A" />
              ) : (
                <Text style={styles.buttonText}>Login</Text>
              )}
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#0F172A" },
  flex: { flex: 1 },
  container: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: 24
  },
  brand: {
    color: "#F8FAFC",
    fontSize: 34,
    fontWeight: "700",
    letterSpacing: 1
  },
  tagline: {
    marginTop: 8,
    color: "#CBD5E1",
    fontSize: 16
  },
  subtitle: {
    marginTop: 6,
    marginBottom: 28,
    color: "#94A3B8",
    fontSize: 14
  },
  form: { gap: 8 },
  label: {
    color: "#E2E8F0",
    fontSize: 13,
    fontWeight: "600",
    marginTop: 8
  },
  input: {
    borderWidth: 1,
    borderColor: "#334155",
    backgroundColor: "#1E293B",
    color: "#F8FAFC",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === "ios" ? 14 : 10,
    fontSize: 16
  },
  error: {
    marginTop: 10,
    color: "#FCA5A5",
    fontSize: 14
  },
  button: {
    marginTop: 18,
    backgroundColor: "#38BDF8",
    borderRadius: 10,
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center"
  },
  buttonDisabled: { opacity: 0.7 },
  buttonText: {
    color: "#0F172A",
    fontSize: 16,
    fontWeight: "700"
  }
});
