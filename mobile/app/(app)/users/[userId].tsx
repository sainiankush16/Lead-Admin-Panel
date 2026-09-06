import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from "react-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";

import { colors } from "@/constants/theme";
import { useAuth } from "@/hooks/useAuth";
import { api, ApiClientError } from "@/services/api";
import type { Project } from "@/types";
import {
  mapManagedUsers,
  mapUserManagementError,
  nextProjectIdsAfterAssign,
  nextProjectIdsAfterRemove,
  validatePasswordChangeForm,
  type MappedManagedUser
} from "@/utils/userManagement";

export default function UserDetailScreen() {
  const router = useRouter();
  const { user: authUser } = useAuth();
  const isAdmin = authUser?.role === "admin";
  const params = useLocalSearchParams<{ userId: string }>();
  const userId = Number(params.userId);

  const [managed, setManaged] = useState<MappedManagedUser | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const [showAssign, setShowAssign] = useState(false);
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null);

  const [showPassword, setShowPassword] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordError, setPasswordError] = useState<string | null>(null);

  const unassignedProjects = useMemo(() => {
    const assigned = new Set((managed?.projects || []).map(p => p.id));
    return projects.filter(p => !assigned.has(p.id));
  }, [projects, managed]);

  const load = useCallback(async (mode: "initial" | "refresh" = "initial") => {
    if (!isAdmin) {
      setError("You don't have permission to manage users.");
      setLoading(false);
      return;
    }
    if (!Number.isSafeInteger(userId) || userId <= 0) {
      setError("User or project not found.");
      setLoading(false);
      return;
    }
    if (mode === "refresh") setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const [usersRes, projectsRes] = await Promise.all([api.getUsers(), api.getProjects()]);
      const mapped = mapManagedUsers(usersRes);
      const found = mapped.find(item => item.id === userId) || null;
      if (!found) {
        setManaged(null);
        setError("User or project not found.");
        return;
      }
      setManaged(found);
      setProjects(Array.isArray(projectsRes.projects) ? projectsRes.projects : []);
    } catch (err) {
      const mapped = mapUserManagementError(
        err instanceof ApiClientError || err instanceof TypeError ? err : null
      );
      setError(mapped.message);
      if (mode === "initial") setManaged(null);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [isAdmin, userId]);

  useEffect(() => {
    void load("initial");
  }, [load]);

  function applyUsersResponse(users: import("@/types").ManagedUser[]) {
    const mapped = mapManagedUsers({ users });
    setManaged(mapped.find(item => item.id === userId) || null);
  }

  async function onToggleActive() {
    if (!managed || busy) return;
    const nextActive = !managed.isActive;
    const title = nextActive ? "Activate User" : "Deactivate User";
    const body = nextActive
      ? "Activate this Project User?"
      : "Deactivate this Project User? Their sessions will be invalidated.";
    Alert.alert(title, body, [
      { text: "Cancel", style: "cancel" },
      {
        text: nextActive ? "Activate" : "Deactivate",
        style: nextActive ? "default" : "destructive",
        onPress: () => {
          void (async () => {
            setBusy(true);
            setMessage(null);
            setError(null);
            try {
              const response = await api.setUserActive(userId, nextActive);
              if (response.users) applyUsersResponse(response.users);
              else await load("refresh");
              setMessage(nextActive ? "User activated." : "User deactivated.");
            } catch (err) {
              const mappedErr = mapUserManagementError(
                err instanceof ApiClientError || err instanceof TypeError ? err : null
              );
              setError(mappedErr.message);
            } finally {
              setBusy(false);
            }
          })();
        }
      }
    ]);
  }

  async function onResetPassword() {
    const validated = validatePasswordChangeForm({ password, confirmPassword });
    if (!validated.ok) {
      setPasswordError(validated.error);
      return;
    }
    if (busy) return;
    setBusy(true);
    setPasswordError(null);
    setError(null);
    try {
      await api.resetUserPassword(userId, validated.value);
      setPassword("");
      setConfirmPassword("");
      setShowPassword(false);
      setMessage("Password updated.");
    } catch (err) {
      const mappedErr = mapUserManagementError(
        err instanceof ApiClientError || err instanceof TypeError ? err : null
      );
      setPasswordError(mappedErr.message);
    } finally {
      setBusy(false);
    }
  }

  async function onAssign() {
    if (!managed || selectedProjectId == null || busy) return;
    const next = nextProjectIdsAfterAssign(
      managed.projects.map(p => p.id),
      selectedProjectId
    );
    if (!next.ok) {
      setError(next.error);
      return;
    }
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const response = await api.replaceUserProjects(userId, next.value);
      if (response.users) applyUsersResponse(response.users);
      else await load("refresh");
      setShowAssign(false);
      setSelectedProjectId(null);
      setMessage("Project assigned.");
    } catch (err) {
      const mappedErr = mapUserManagementError(
        err instanceof ApiClientError || err instanceof TypeError ? err : null
      );
      setError(mappedErr.message);
    } finally {
      setBusy(false);
    }
  }

  function onRemoveProject(projectId: number, projectName: string) {
    if (!managed || busy) return;
    Alert.alert("Remove this project assignment?", projectName, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: () => {
          void (async () => {
            const next = nextProjectIdsAfterRemove(
              managed.projects.map(p => p.id),
              projectId
            );
            setBusy(true);
            setError(null);
            setMessage(null);
            try {
              const response = await api.replaceUserProjects(userId, next.value);
              if (response.users) applyUsersResponse(response.users);
              else await load("refresh");
              setMessage("Project assignment removed.");
            } catch (err) {
              const mappedErr = mapUserManagementError(
                err instanceof ApiClientError || err instanceof TypeError ? err : null
              );
              setError(mappedErr.message);
            } finally {
              setBusy(false);
            }
          })();
        }
      }
    ]);
  }

  if (!isAdmin) {
    return (
      <SafeAreaView style={styles.safe} edges={["bottom"]}>
        <Stack.Screen options={{ title: "User" }} />
        <View style={styles.center}>
          <Text style={styles.error}>You don't have permission to manage users.</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={["bottom"]}>
      <Stack.Screen options={{ title: managed?.loginId || "User" }} />

      {loading && !managed ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.accent} size="large" />
          <Text style={styles.muted}>Loading users...</Text>
        </View>
      ) : null}

      {error && !managed && !loading ? (
        <View style={styles.center}>
          <Text style={styles.error}>{error}</Text>
          <Pressable
            style={styles.button}
            accessibilityRole="button"
            accessibilityLabel="Retry"
            onPress={() => {
              void load("initial");
            }}
          >
            <Text style={styles.buttonText}>Retry</Text>
          </Pressable>
        </View>
      ) : null}

      {managed ? (
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                void load("refresh");
              }}
              tintColor={colors.accent}
            />
          }
        >
          <Text style={styles.login}>{managed.loginId}</Text>
          <Text style={styles.name}>{managed.name}</Text>
          <Text style={styles.meta}>{managed.roleLabel}</Text>
          <Text style={styles.meta}>{managed.statusLabel}</Text>

          {message ? <Text style={styles.success}>{message}</Text> : null}
          {error ? <Text style={styles.errorInline}>{error}</Text> : null}

          <Pressable
            style={[styles.actionBtn, busy && styles.disabled]}
            disabled={busy}
            accessibilityRole="button"
            accessibilityLabel={managed.isActive ? "Deactivate User" : "Activate User"}
            onPress={() => {
              void onToggleActive();
            }}
          >
            <Text style={styles.actionText}>
              {busy ? "Saving..." : managed.isActive ? "Deactivate User" : "Activate User"}
            </Text>
          </Pressable>

          <Text style={styles.sectionTitle}>Assigned Projects</Text>
          {managed.projects.length === 0 ? (
            <Text style={styles.muted}>No projects assigned.</Text>
          ) : (
            managed.projects.map(project => (
              <View key={project.id} style={styles.projectRow}>
                <Text style={styles.projectName}>• {project.name}</Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Remove ${project.name}`}
                  disabled={busy}
                  onPress={() => onRemoveProject(project.id, project.name)}
                >
                  <Text style={styles.remove}>Remove</Text>
                </Pressable>
              </View>
            ))
          )}

          {!showAssign ? (
            <Pressable
              style={styles.linkBtn}
              accessibilityRole="button"
              accessibilityLabel="Assign Project"
              disabled={busy}
              onPress={() => {
                setShowAssign(true);
                setSelectedProjectId(null);
                setError(null);
              }}
            >
              <Text style={styles.linkText}>+ Assign Project</Text>
            </Pressable>
          ) : (
            <View style={styles.assignBox}>
              <Text style={styles.sectionTitle}>Select Project</Text>
              {unassignedProjects.length === 0 ? (
                <Text style={styles.muted}>No additional projects available.</Text>
              ) : (
                unassignedProjects.map(project => {
                  const selected = selectedProjectId === project.id;
                  return (
                    <Pressable
                      key={project.id}
                      style={[styles.option, selected && styles.optionSelected]}
                      accessibilityRole="radio"
                      accessibilityState={{ selected }}
                      onPress={() => setSelectedProjectId(project.id)}
                    >
                      <Text style={styles.optionText}>{project.name}</Text>
                    </Pressable>
                  );
                })
              )}
              <View style={styles.rowActions}>
                <Pressable
                  style={styles.secondary}
                  disabled={busy}
                  onPress={() => {
                    setShowAssign(false);
                    setSelectedProjectId(null);
                  }}
                >
                  <Text style={styles.secondaryText}>Cancel</Text>
                </Pressable>
                <Pressable
                  style={[styles.button, (!selectedProjectId || busy) && styles.disabled]}
                  disabled={!selectedProjectId || busy}
                  accessibilityRole="button"
                  accessibilityLabel={busy ? "Assigning" : "Assign"}
                  onPress={() => {
                    void onAssign();
                  }}
                >
                  <Text style={styles.buttonText}>{busy ? "Assigning..." : "Assign"}</Text>
                </Pressable>
              </View>
            </View>
          )}

          <Text style={styles.sectionTitle}>Reset Password</Text>
          {!showPassword ? (
            <Pressable
              style={styles.linkBtn}
              accessibilityRole="button"
              accessibilityLabel="Reset Password"
              onPress={() => {
                setShowPassword(true);
                setPassword("");
                setConfirmPassword("");
                setPasswordError(null);
              }}
            >
              <Text style={styles.linkText}>Reset Password</Text>
            </Pressable>
          ) : (
            <View style={styles.assignBox}>
              <Text style={styles.label}>New Password</Text>
              <TextInput
                style={styles.input}
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                editable={!busy}
                placeholder="At least 8 characters"
                placeholderTextColor={colors.textMuted}
              />
              <Text style={styles.label}>Confirm Password</Text>
              <TextInput
                style={styles.input}
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                secureTextEntry
                editable={!busy}
                placeholder="Confirm password"
                placeholderTextColor={colors.textMuted}
              />
              {passwordError ? <Text style={styles.errorInline}>{passwordError}</Text> : null}
              <View style={styles.rowActions}>
                <Pressable
                  style={styles.secondary}
                  disabled={busy}
                  onPress={() => {
                    setShowPassword(false);
                    setPassword("");
                    setConfirmPassword("");
                    setPasswordError(null);
                  }}
                >
                  <Text style={styles.secondaryText}>Cancel</Text>
                </Pressable>
                <Pressable
                  style={[styles.button, busy && styles.disabled]}
                  disabled={busy}
                  onPress={() => {
                    void onResetPassword();
                  }}
                >
                  <Text style={styles.buttonText}>{busy ? "Saving..." : "Save Password"}</Text>
                </Pressable>
              </View>
            </View>
          )}
        </ScrollView>
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 20, paddingBottom: 48 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, padding: 24 },
  login: { color: colors.text, fontSize: 28, fontWeight: "800" },
  name: { marginTop: 6, color: colors.textSoft, fontSize: 16 },
  meta: { marginTop: 6, color: colors.textMuted, fontWeight: "600" },
  sectionTitle: {
    marginTop: 24,
    marginBottom: 10,
    color: colors.text,
    fontSize: 18,
    fontWeight: "700"
  },
  muted: { color: colors.textMuted },
  error: { color: colors.danger, textAlign: "center" },
  errorInline: { marginTop: 10, color: colors.danger },
  success: { marginTop: 10, color: colors.accent, fontWeight: "600" },
  actionBtn: {
    marginTop: 18,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.card
  },
  actionText: { color: colors.text, fontWeight: "700" },
  projectRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.cardBorder
  },
  projectName: { color: colors.textSoft, flex: 1, paddingRight: 12 },
  remove: { color: colors.danger, fontWeight: "700" },
  linkBtn: { marginTop: 12, minHeight: 40, justifyContent: "center" },
  linkText: { color: colors.accent, fontWeight: "800" },
  assignBox: {
    marginTop: 10,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: 12,
    backgroundColor: colors.card,
    padding: 14,
    gap: 8
  },
  option: {
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: 8,
    padding: 12,
    backgroundColor: colors.bg
  },
  optionSelected: { borderColor: colors.accent },
  optionText: { color: colors.text },
  rowActions: { flexDirection: "row", justifyContent: "flex-end", gap: 10, marginTop: 8 },
  button: {
    backgroundColor: colors.accent,
    borderRadius: 10,
    paddingHorizontal: 14,
    minHeight: 44,
    justifyContent: "center",
    alignItems: "center"
  },
  buttonText: { color: colors.bg, fontWeight: "800" },
  secondary: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    paddingHorizontal: 14,
    minHeight: 44,
    justifyContent: "center"
  },
  secondaryText: { color: colors.textSoft, fontWeight: "700" },
  label: { color: colors.textMuted, fontSize: 12, fontWeight: "700" },
  input: {
    minHeight: 44,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    backgroundColor: colors.bg,
    color: colors.text,
    paddingHorizontal: 12
  },
  disabled: { opacity: 0.45 }
});
