import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View
} from "react-native";
import { Stack, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";

import { UserCard } from "@/components/UserCard";
import { UserForm, type UserFormValues } from "@/components/UserForm";
import { colors } from "@/constants/theme";
import { useAuth } from "@/hooks/useAuth";
import { api, ApiClientError } from "@/services/api";
import {
  mapManagedUsers,
  mapUserManagementError,
  validateCreateUserForm,
  type MappedManagedUser
} from "@/utils/userManagement";

const EMPTY_FORM: UserFormValues = {
  name: "",
  loginId: "",
  password: "",
  confirmPassword: ""
};

export default function UsersListScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

  const [users, setUsers] = useState<MappedManagedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<UserFormValues>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);

  const load = useCallback(async (mode: "initial" | "refresh" = "initial") => {
    if (!isAdmin) {
      setForbidden(true);
      setError("You don't have permission to manage users.");
      setLoading(false);
      return;
    }
    if (mode === "refresh") setRefreshing(true);
    else setLoading(true);
    setError(null);
    setForbidden(false);
    try {
      const response = await api.getUsers();
      setUsers(mapManagedUsers(response));
    } catch (err) {
      const mapped = mapUserManagementError(
        err instanceof ApiClientError || err instanceof TypeError ? err : null
      );
      setError(mapped.message);
      if (err instanceof ApiClientError && err.status === 403) setForbidden(true);
      if (mode === "initial") setUsers([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [isAdmin]);

  useEffect(() => {
    void load("initial");
  }, [load]);

  async function onCreate() {
    const validated = validateCreateUserForm(form);
    if (!validated.ok) {
      setFormError(validated.error);
      return;
    }
    if (saving) return;
    setSaving(true);
    setFormError(null);
    setSuccess(null);
    try {
      await api.createUser({
        name: validated.value.name,
        loginId: validated.value.loginId,
        password: validated.value.password,
        projectIds: []
      });
      setForm(EMPTY_FORM);
      setShowForm(false);
      setSuccess("User created.");
      await load("refresh");
    } catch (err) {
      const mapped = mapUserManagementError(
        err instanceof ApiClientError || err instanceof TypeError ? err : null
      );
      setFormError(mapped.message);
    } finally {
      setSaving(false);
    }
  }

  if (!isAdmin) {
    return (
      <SafeAreaView style={styles.safe} edges={["bottom"]}>
        <Stack.Screen options={{ title: "Users" }} />
        <View style={styles.center}>
          <Text style={styles.error}>You don't have permission to manage users.</Text>
          <Pressable
            style={styles.button}
            accessibilityRole="button"
            accessibilityLabel="Back to dashboard"
            onPress={() => router.replace("/")}
          >
            <Text style={styles.buttonText}>Back to Dashboard</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={["bottom"]}>
      <Stack.Screen options={{ title: "Users" }} />

      {loading && users.length === 0 ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.accent} size="large" />
          <Text style={styles.muted}>Loading users...</Text>
        </View>
      ) : null}

      {error && users.length === 0 && !loading ? (
        <View style={styles.center}>
          <Text style={styles.error}>{error}</Text>
          {forbidden ? null : (
            <Pressable
              style={styles.button}
              accessibilityRole="button"
              accessibilityLabel="Retry loading users"
              onPress={() => {
                void load("initial");
              }}
            >
              <Text style={styles.buttonText}>Retry</Text>
            </Pressable>
          )}
        </View>
      ) : null}

      {!loading || users.length > 0 ? (
        <FlatList
          data={users}
          keyExtractor={item => String(item.id)}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                void load("refresh");
              }}
              tintColor={colors.accent}
            />
          }
          ListHeaderComponent={
            <View style={styles.header}>
              <Text style={styles.title}>Users</Text>
              <Text style={styles.subtitle}>Manage Project Users and assignments</Text>
              {success ? <Text style={styles.success}>{success}</Text> : null}
              {error && users.length > 0 ? <Text style={styles.errorInline}>{error}</Text> : null}

              {showForm ? (
                <UserForm
                  values={form}
                  error={formError}
                  busy={saving}
                  submitLabel="Create User"
                  onChange={setForm}
                  onCancel={() => {
                    setShowForm(false);
                    setForm(EMPTY_FORM);
                    setFormError(null);
                  }}
                  onSubmit={() => {
                    void onCreate();
                  }}
                />
              ) : (
                <Pressable
                  style={styles.addBtn}
                  accessibilityRole="button"
                  accessibilityLabel="Add User"
                  onPress={() => {
                    setShowForm(true);
                    setSuccess(null);
                    setFormError(null);
                  }}
                >
                  <Text style={styles.addBtnText}>+ Add User</Text>
                </Pressable>
              )}
            </View>
          }
          ListEmptyComponent={
            !loading ? (
              <Text style={styles.muted}>No users found.</Text>
            ) : null
          }
          renderItem={({ item }) => (
            <UserCard
              user={item}
              onPress={() => router.push(`/users/${item.id}`)}
            />
          )}
        />
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  list: { padding: 20, paddingBottom: 40 },
  header: { marginBottom: 8 },
  title: { color: colors.text, fontSize: 28, fontWeight: "800" },
  subtitle: { marginTop: 6, marginBottom: 14, color: colors.textMuted, fontSize: 14 },
  addBtn: {
    alignSelf: "flex-start",
    minHeight: 44,
    justifyContent: "center",
    marginBottom: 12
  },
  addBtnText: { color: colors.accent, fontWeight: "800", fontSize: 16 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, padding: 24 },
  muted: { color: colors.textMuted, textAlign: "center" },
  error: { color: colors.danger, textAlign: "center", fontSize: 15 },
  errorInline: { color: colors.danger, marginBottom: 8 },
  success: { color: colors.accent, marginBottom: 8, fontWeight: "600" },
  button: {
    backgroundColor: colors.accent,
    borderRadius: 10,
    paddingHorizontal: 16,
    minHeight: 44,
    justifyContent: "center"
  },
  buttonText: { color: colors.bg, fontWeight: "700" }
});
