import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from "react-native";
import { Stack, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";

import { colors } from "@/constants/theme";
import { useAuth } from "@/hooks/useAuth";
import { api, ApiClientError } from "@/services/api";
import {
  canSubmitCreateProject,
  filterSpreadsheets,
  mapProjectManagementError,
  mapSheetTabs,
  mapSpreadsheets,
  validateCreateProjectPayload,
  validateProjectName,
  type SheetTabOption,
  type SpreadsheetOption
} from "@/utils/projectManagement";

type Step = "spreadsheet" | "sheet" | "name" | "review";

export default function AddProjectScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

  const [step, setStep] = useState<Step>("spreadsheet");
  const [googleConnected, setGoogleConnected] = useState<boolean | null>(null);
  const [googleEmail, setGoogleEmail] = useState<string | null>(null);

  const [spreadsheets, setSpreadsheets] = useState<SpreadsheetOption[]>([]);
  const [sheetTabs, setSheetTabs] = useState<SheetTabOption[]>([]);
  const [query, setQuery] = useState("");

  const [selectedSpreadsheet, setSelectedSpreadsheet] = useState<SpreadsheetOption | null>(null);
  const [selectedTab, setSelectedTab] = useState<SheetTabOption | null>(null);
  const [projectName, setProjectName] = useState("");

  const [loading, setLoading] = useState(true);
  const [loadingTabs, setLoadingTabs] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nameError, setNameError] = useState<string | null>(null);

  const filtered = useMemo(
    () => filterSpreadsheets(spreadsheets, query),
    [spreadsheets, query]
  );

  const loadBootstrap = useCallback(async () => {
    if (!isAdmin) {
      setError("You don't have permission to manage projects.");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const status = await api.getGoogleStatus();
      setGoogleConnected(Boolean(status.connected));
      setGoogleEmail(status.email || null);
      if (!status.connected) {
        setSpreadsheets([]);
        return;
      }
      const sheets = await api.listSpreadsheets();
      setSpreadsheets(mapSpreadsheets(sheets));
    } catch (err) {
      const mapped = mapProjectManagementError(
        err instanceof ApiClientError || err instanceof TypeError ? err : null
      );
      setError(mapped.message);
      if (mapped.clearAuth) {
        // auth handler already clears session on 401 bearer
      }
    } finally {
      setLoading(false);
    }
  }, [isAdmin]);

  useEffect(() => {
    void loadBootstrap();
  }, [loadBootstrap]);

  async function loadTabs(spreadsheet: SpreadsheetOption) {
    setLoadingTabs(true);
    setError(null);
    setSheetTabs([]);
    setSelectedTab(null);
    try {
      const response = await api.listSheetTabs(spreadsheet.id);
      setSheetTabs(mapSheetTabs(response));
      setStep("sheet");
    } catch (err) {
      const mapped = mapProjectManagementError(
        err instanceof ApiClientError || err instanceof TypeError ? err : null
      );
      setError(mapped.message);
    } finally {
      setLoadingTabs(false);
    }
  }

  async function onSave() {
    if (saving || !selectedSpreadsheet || !selectedTab) return;
    const validated = validateCreateProjectPayload({
      name: projectName,
      spreadsheetId: selectedSpreadsheet.id,
      sheetId: selectedTab.sheetId,
      sheetTitle: selectedTab.title
    });
    if (!validated.ok) {
      setNameError(validated.error);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const created = await api.createProject(validated.value);
      router.replace(`/projects/${created.project.id}`);
    } catch (err) {
      const mapped = mapProjectManagementError(
        err instanceof ApiClientError || err instanceof TypeError ? err : null
      );
      setError(mapped.message);
    } finally {
      setSaving(false);
    }
  }

  if (!isAdmin) {
    return (
      <SafeAreaView style={styles.safe} edges={["bottom"]}>
        <Stack.Screen options={{ title: "Add Project" }} />
        <View style={styles.center}>
          <Text style={styles.error}>You don't have permission to manage projects.</Text>
          <Pressable style={styles.button} onPress={() => router.replace("/projects")}>
            <Text style={styles.buttonText}>Back to Projects</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={["bottom"]}>
      <Stack.Screen options={{ title: "Add Project" }} />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator color={colors.accent} size="large" />
            <Text style={styles.muted}>Loading spreadsheets...</Text>
          </View>
        ) : null}

        {!loading && googleConnected === false ? (
          <View style={styles.center}>
            <Text style={styles.error}>
              Google Sheets is not connected. Connect Google from the Website CRM admin on the web,
              then try again.
            </Text>
            <Pressable
              style={styles.button}
              accessibilityRole="button"
              accessibilityLabel="Retry"
              onPress={() => {
                void loadBootstrap();
              }}
            >
              <Text style={styles.buttonText}>Retry</Text>
            </Pressable>
          </View>
        ) : null}

        {!loading && googleConnected ? (
          <View style={styles.flex}>
            <Text style={styles.stepLabel}>
              {step === "spreadsheet"
                ? "Step 1 · Select spreadsheet"
                : step === "sheet"
                  ? "Step 2 · Select sheet tab"
                  : step === "name"
                    ? "Step 3 · Project name"
                    : "Step 4 · Review & save"}
            </Text>
            {googleEmail ? <Text style={styles.meta}>Google: {googleEmail}</Text> : null}
            {error ? <Text style={styles.errorInline}>{error}</Text> : null}

            {step === "spreadsheet" ? (
              <View style={styles.flex}>
                <TextInput
                  style={styles.input}
                  value={query}
                  onChangeText={setQuery}
                  placeholder="Search spreadsheets..."
                  placeholderTextColor={colors.textMuted}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                {filtered.length === 0 ? (
                  <Text style={styles.muted}>
                    {query.trim() ? "No search results." : "No spreadsheets found."}
                  </Text>
                ) : (
                  <FlatList
                    data={filtered}
                    keyExtractor={item => item.id}
                    contentContainerStyle={styles.list}
                    renderItem={({ item }) => (
                      <Pressable
                        style={styles.option}
                        accessibilityRole="button"
                        accessibilityLabel={`Select spreadsheet ${item.name}`}
                        disabled={loadingTabs}
                        onPress={() => {
                          setSelectedSpreadsheet(item);
                          void loadTabs(item);
                        }}
                      >
                        <Text style={styles.optionTitle}>{item.name}</Text>
                      </Pressable>
                    )}
                  />
                )}
                {loadingTabs ? (
                  <View style={styles.inlineLoading}>
                    <ActivityIndicator color={colors.accent} />
                    <Text style={styles.muted}>Loading tabs...</Text>
                  </View>
                ) : null}
              </View>
            ) : null}

            {step === "sheet" ? (
              <ScrollView contentContainerStyle={styles.list}>
                <Text style={styles.meta}>Spreadsheet: {selectedSpreadsheet?.name}</Text>
                {sheetTabs.length === 0 ? (
                  <Text style={styles.muted}>No sheet tabs found.</Text>
                ) : (
                  sheetTabs.map(tab => (
                    <Pressable
                      key={`${tab.sheetId}-${tab.title}`}
                      style={styles.option}
                      accessibilityRole="button"
                      accessibilityLabel={`Select sheet ${tab.title}`}
                      onPress={() => {
                        setSelectedTab(tab);
                        setProjectName(selectedSpreadsheet?.name || "");
                        setStep("name");
                      }}
                    >
                      <Text style={styles.optionTitle}>{tab.title}</Text>
                    </Pressable>
                  ))
                )}
                <Pressable style={styles.link} onPress={() => setStep("spreadsheet")}>
                  <Text style={styles.linkText}>Back to spreadsheets</Text>
                </Pressable>
              </ScrollView>
            ) : null}

            {step === "name" ? (
              <ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled">
                <Text style={styles.meta}>Spreadsheet: {selectedSpreadsheet?.name}</Text>
                <Text style={styles.meta}>Sheet: {selectedTab?.title}</Text>
                <Text style={styles.label}>Project Name</Text>
                <TextInput
                  style={styles.input}
                  value={projectName}
                  onChangeText={text => {
                    setProjectName(text);
                    setNameError(null);
                  }}
                  placeholder="Project name"
                  placeholderTextColor={colors.textMuted}
                />
                {nameError ? <Text style={styles.errorInline}>{nameError}</Text> : null}
                <Pressable
                  style={styles.button}
                  onPress={() => {
                    const validated = validateProjectName(projectName);
                    if (!validated.ok) {
                      setNameError(validated.error);
                      return;
                    }
                    setProjectName(validated.value);
                    setStep("review");
                  }}
                >
                  <Text style={styles.buttonText}>Continue</Text>
                </Pressable>
                <Pressable style={styles.link} onPress={() => setStep("sheet")}>
                  <Text style={styles.linkText}>Back to sheets</Text>
                </Pressable>
              </ScrollView>
            ) : null}

            {step === "review" ? (
              <ScrollView contentContainerStyle={styles.form}>
                <Text style={styles.reviewTitle}>Review configuration</Text>
                <Text style={styles.label}>Project Name</Text>
                <Text style={styles.value}>{projectName}</Text>
                <Text style={styles.label}>Spreadsheet</Text>
                <Text style={styles.value}>{selectedSpreadsheet?.name}</Text>
                <Text style={styles.label}>Sheet / Tab</Text>
                <Text style={styles.value}>{selectedTab?.title}</Text>
                <Pressable
                  style={[
                    styles.button,
                    (!canSubmitCreateProject({
                      draft: {
                        name: projectName,
                        spreadsheetId: selectedSpreadsheet?.id,
                        sheetId: selectedTab?.sheetId,
                        sheetTitle: selectedTab?.title
                      },
                      saving
                    }) ||
                      saving) &&
                      styles.disabled
                  ]}
                  disabled={
                    !canSubmitCreateProject({
                      draft: {
                        name: projectName,
                        spreadsheetId: selectedSpreadsheet?.id,
                        sheetId: selectedTab?.sheetId,
                        sheetTitle: selectedTab?.title
                      },
                      saving
                    }) || saving
                  }
                  accessibilityRole="button"
                  accessibilityLabel={saving ? "Saving project" : "Save Project"}
                  onPress={() => {
                    void onSave();
                  }}
                >
                  {saving ? (
                    <View style={styles.row}>
                      <ActivityIndicator color={colors.bg} />
                      <Text style={styles.buttonText}>Saving...</Text>
                    </View>
                  ) : (
                    <Text style={styles.buttonText}>Save Project</Text>
                  )}
                </Pressable>
                <Pressable
                  style={styles.link}
                  disabled={saving}
                  onPress={() => setStep("name")}
                >
                  <Text style={styles.linkText}>Back</Text>
                </Pressable>
              </ScrollView>
            ) : null}
          </View>
        ) : null}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, padding: 24 },
  stepLabel: {
    paddingHorizontal: 20,
    paddingTop: 12,
    color: colors.text,
    fontWeight: "800",
    fontSize: 16
  },
  meta: { paddingHorizontal: 20, marginTop: 6, color: colors.textMuted, fontSize: 13 },
  list: { padding: 20, paddingBottom: 40 },
  form: { padding: 20, paddingBottom: 40, gap: 8 },
  input: {
    marginHorizontal: 20,
    marginTop: 12,
    minHeight: 48,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    backgroundColor: colors.card,
    color: colors.text,
    paddingHorizontal: 14
  },
  option: {
    borderWidth: 1,
    borderColor: colors.cardBorder,
    backgroundColor: colors.card,
    borderRadius: 10,
    padding: 14,
    marginBottom: 10
  },
  optionTitle: { color: colors.text, fontWeight: "700" },
  muted: { color: colors.textMuted, textAlign: "center", padding: 20 },
  error: { color: colors.danger, textAlign: "center" },
  errorInline: { color: colors.danger, paddingHorizontal: 20, marginTop: 8 },
  button: {
    marginTop: 16,
    backgroundColor: colors.accent,
    borderRadius: 10,
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16
  },
  buttonText: { color: colors.bg, fontWeight: "800" },
  disabled: { opacity: 0.45 },
  link: { marginTop: 14, alignItems: "center" },
  linkText: { color: colors.accent, fontWeight: "700" },
  label: { color: colors.textMuted, fontSize: 12, fontWeight: "700", marginTop: 10 },
  value: { color: colors.text, fontSize: 16, fontWeight: "600" },
  reviewTitle: { color: colors.text, fontSize: 20, fontWeight: "800", marginBottom: 8 },
  inlineLoading: {
    position: "absolute",
    bottom: 24,
    left: 0,
    right: 0,
    alignItems: "center",
    gap: 8
  },
  row: { flexDirection: "row", alignItems: "center", gap: 10 }
});
