import { useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Keyboard,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View
} from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";

import { LeadSearchResultCard } from "@/components/LeadSearchResultCard";
import { colors } from "@/constants/theme";
import { api, ApiClientError } from "@/services/api";
import {
  applySuccessfulSearch,
  canSubmitSearch,
  clearSearchState,
  createInitialSearchState,
  formatSearchResultCount,
  mapSearchError,
  MAX_QUERY_LENGTH,
  partialSheetErrorMessage,
  validateSearchDraft,
  type MappedSearchResult,
  type SearchUiState
} from "@/utils/globalSearch";

export default function SearchScreen() {
  const router = useRouter();
  const [state, setState] = useState<SearchUiState>(createInitialSearchState());
  const [localValidation, setLocalValidation] = useState<string | null>(null);

  const submitEnabled = canSubmitSearch({ query: state.query, searching: state.searching });

  async function runSearch() {
    const validated = validateSearchDraft(state.query);
    if (!validated.ok) {
      setLocalValidation(validated.error);
      return;
    }
    if (state.searching) return;

    Keyboard.dismiss();
    setLocalValidation(null);
    setState(prev => ({
      ...prev,
      searching: true,
      error: null,
      partialErrors: false
    }));

    try {
      const response = await api.searchLeads(validated.value);
      setState(prev => applySuccessfulSearch(prev, response, validated.value));
    } catch (err) {
      const mapped = mapSearchError(err instanceof ApiClientError || err instanceof TypeError ? err : null);
      setState(prev => ({
        ...prev,
        searching: false,
        error: mapped.message,
        results: [],
        count: 0,
        hasSearched: true,
        partialErrors: false
      }));
    }
  }

  function onClear() {
    setLocalValidation(null);
    setState(clearSearchState());
  }

  function openLead(item: MappedSearchResult) {
    if (!item.href) return;
    router.push(item.href as `/projects/${number}/lead/${number}`);
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.header}>
        <Text style={styles.title}>Search</Text>
        <Text style={styles.subtitle}>Search leads across your authorized projects</Text>

        <View style={styles.searchRow}>
          <TextInput
            style={styles.input}
            value={state.query}
            onChangeText={text => {
              setState(prev => ({ ...prev, query: text }));
              setLocalValidation(null);
            }}
            placeholder="Search leads..."
            placeholderTextColor={colors.textMuted}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
            maxLength={MAX_QUERY_LENGTH}
            editable={!state.searching}
            accessibilityLabel="Search leads by name, phone, or email"
            onSubmitEditing={() => {
              void runSearch();
            }}
          />
          {state.query.length > 0 ? (
            <Pressable
              style={styles.clearBtn}
              accessibilityRole="button"
              accessibilityLabel="Clear search"
              disabled={state.searching}
              onPress={onClear}
            >
              <Text style={styles.clearText}>Clear</Text>
            </Pressable>
          ) : null}
        </View>

        <Pressable
          style={[styles.searchBtn, !submitEnabled && styles.disabled]}
          disabled={!submitEnabled}
          accessibilityRole="button"
          accessibilityLabel="Search leads"
          accessibilityState={{ disabled: !submitEnabled, busy: state.searching }}
          onPress={() => {
            void runSearch();
          }}
        >
          {state.searching ? (
            <View style={styles.searchingRow}>
              <ActivityIndicator color={colors.bg} />
              <Text style={styles.searchBtnText}>Searching...</Text>
            </View>
          ) : (
            <Text style={styles.searchBtnText}>Search</Text>
          )}
        </Pressable>

        {localValidation ? <Text style={styles.error}>{localValidation}</Text> : null}
        {state.error ? (
          <View style={styles.errorBlock}>
            <Text style={styles.error}>{state.error}</Text>
            <Pressable
              style={styles.retryBtn}
              accessibilityRole="button"
              accessibilityLabel="Retry search"
              onPress={() => {
                void runSearch();
              }}
            >
              <Text style={styles.retryText}>Retry</Text>
            </Pressable>
          </View>
        ) : null}
      </View>

      {state.searching ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.accent} size="large" />
          <Text style={styles.muted}>Searching leads...</Text>
        </View>
      ) : null}

      {!state.searching && !state.hasSearched ? (
        <View style={styles.center}>
          <Text style={styles.muted}>
            Search your leads by name, phone, email, or other lead information.
          </Text>
        </View>
      ) : null}

      {!state.searching && state.hasSearched && !state.error ? (
        <FlatList
          data={state.results}
          keyExtractor={item => `${item.projectId}-${item.rowNumber}`}
          contentContainerStyle={styles.list}
          keyboardShouldPersistTaps="handled"
          ListHeaderComponent={
            <View style={styles.listHeader}>
              <Text style={styles.count}>{formatSearchResultCount(state.count)}</Text>
              {state.partialErrors ? (
                <Text style={styles.partial}>{partialSheetErrorMessage()}</Text>
              ) : null}
              {state.count === 0 ? (
                <Text style={styles.muted}>
                  Try a different name, phone number, email, or keyword.
                </Text>
              ) : null}
            </View>
          }
          renderItem={({ item }) => (
            <LeadSearchResultCard item={item} onPress={() => openLead(item)} />
          )}
        />
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 8 },
  title: { color: colors.text, fontSize: 28, fontWeight: "800" },
  subtitle: { marginTop: 6, marginBottom: 16, color: colors.textMuted, fontSize: 14 },
  searchRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  input: {
    flex: 1,
    minHeight: 48,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    backgroundColor: colors.card,
    color: colors.text,
    paddingHorizontal: 14,
    fontSize: 16
  },
  clearBtn: {
    minHeight: 44,
    justifyContent: "center",
    paddingHorizontal: 4
  },
  clearText: { color: colors.accent, fontWeight: "700" },
  searchBtn: {
    marginTop: 12,
    backgroundColor: colors.accent,
    borderRadius: 10,
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center"
  },
  searchBtnText: { color: colors.bg, fontWeight: "800", fontSize: 16 },
  searchingRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  disabled: { opacity: 0.4 },
  error: { marginTop: 10, color: colors.danger, fontSize: 13 },
  errorBlock: { marginTop: 4, gap: 8 },
  retryBtn: {
    alignSelf: "flex-start",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    paddingHorizontal: 12,
    minHeight: 36,
    justifyContent: "center",
    backgroundColor: colors.card
  },
  retryText: { color: colors.textSoft, fontWeight: "700" },
  center: { flex: 1, paddingHorizontal: 24, justifyContent: "center", alignItems: "center" },
  muted: { color: colors.textMuted, fontSize: 15, textAlign: "center", lineHeight: 22 },
  list: { paddingHorizontal: 20, paddingBottom: 32 },
  listHeader: { marginBottom: 12, gap: 6 },
  count: { color: colors.text, fontWeight: "700", fontSize: 15 },
  partial: { color: colors.danger, fontSize: 13 }
});
