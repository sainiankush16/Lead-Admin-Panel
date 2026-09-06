import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent
} from "react-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";

import { LeadContactActions } from "@/components/LeadContactActions";
import { LeadContactRemarkSection } from "@/components/LeadContactRemarkSection";
import { LeadDetailHeader } from "@/components/LeadDetailHeader";
import { LeadFollowUpSection } from "@/components/LeadFollowUpSection";
import { LeadIntelligenceSummary } from "@/components/LeadIntelligenceSummary";
import { LeadNextActions } from "@/components/LeadNextActions";
import { LeadRemarksSection } from "@/components/LeadRemarksSection";
import { LeadSmartNextAction } from "@/components/LeadSmartNextAction";
import { LeadTimelineSection } from "@/components/LeadTimelineSection";
import { LEAD_STATUSES, type LeadStatusValue } from "@/constants/leadStatus";
import { colors } from "@/constants/theme";
import { useAuth } from "@/hooks/useAuth";
import { api, ApiClientError } from "@/services/api";
import type { Remark, TimelineEvent } from "@/types";
import {
  contactRemarkSuccessMessage,
  mapContactRemarkError
} from "@/utils/leadContactActivity";
import { buildLeadDetail, type LeadDetailModel } from "@/utils/leadDetail";
import {
  FOLLOW_UP_STATUS,
  alreadyFollowUpMessage,
  followUpRemarkSuccessMessage,
  followUpSuccessMessage,
  mapFollowUpRemarkError,
  mapFollowUpStatusError,
  shouldMarkFollowUp
} from "@/utils/leadFollowUp";
import {
  leadIdFromRowNumber,
  mapRemarkMutationError,
  mapRemarksLoadError
} from "@/utils/leadRemarks";
import {
  applySuccessfulStatusUpdate,
  canEnableSaveStatus,
  initialStatusSelection,
  mapStatusUpdateError,
  shouldSubmitStatusChange
} from "@/utils/leadStatusEdit";
import { mapTimelineLoadError } from "@/utils/leadTimeline";
import { shouldCollapseAdditionalFieldsByDefault } from "@/utils/leadWorkflow";

function FieldRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.fieldRow}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <Text style={styles.fieldValue}>{value}</Text>
    </View>
  );
}

export default function LeadDetailScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const params = useLocalSearchParams<{ projectId: string; rowNumber: string }>();
  const projectId = Number(params.projectId);
  const rowNumber = Number(params.rowNumber);
  const leadId = leadIdFromRowNumber(rowNumber);

  const [detail, setDetail] = useState<LeadDetailModel | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);

  const [selectedStatus, setSelectedStatus] = useState<LeadStatusValue | null>(null);
  const [savingStatus, setSavingStatus] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);

  const [remarks, setRemarks] = useState<Remark[]>([]);
  const [remarksLoading, setRemarksLoading] = useState(false);
  const [remarksError, setRemarksError] = useState<string | null>(null);
  const [remarkBusy, setRemarkBusy] = useState(false);
  const [remarkMutationError, setRemarkMutationError] = useState<string | null>(null);
  const [followUpStatusMessage, setFollowUpStatusMessage] = useState<string | null>(null);
  const [followUpStatusError, setFollowUpStatusError] = useState<string | null>(null);
  const [followUpRemarkMessage, setFollowUpRemarkMessage] = useState<string | null>(null);
  const [followUpRemarkError, setFollowUpRemarkError] = useState<string | null>(null);
  const [contactRemarkMessage, setContactRemarkMessage] = useState<string | null>(null);
  const [contactRemarkError, setContactRemarkError] = useState<string | null>(null);

  const [timelineEvents, setTimelineEvents] = useState<TimelineEvent[]>([]);
  const [timelineLoading, setTimelineLoading] = useState(false);
  const [timelineError, setTimelineError] = useState<string | null>(null);
  const [fieldsExpanded, setFieldsExpanded] = useState(false);
  const [fieldsCollapseInitialized, setFieldsCollapseInitialized] = useState(false);

  const scrollRef = useRef<ScrollView | null>(null);
  const sectionOffsets = useRef<Record<string, number>>({});

  const syncSelectionFromDetail = useCallback((next: LeadDetailModel) => {
    setSelectedStatus(initialStatusSelection(next.status));
  }, []);

  useEffect(() => {
    setFieldsCollapseInitialized(false);
  }, [leadId]);

  useEffect(() => {
    if (!detail || fieldsCollapseInitialized) return;
    setFieldsExpanded(!shouldCollapseAdditionalFieldsByDefault(detail.fields.length));
    setFieldsCollapseInitialized(true);
  }, [detail, fieldsCollapseInitialized]);

  function rememberSection(id: string, event: LayoutChangeEvent) {
    sectionOffsets.current[id] = event.nativeEvent.layout.y;
  }

  function jumpToSection(id: string) {
    const y = sectionOffsets.current[id];
    if (y == null || !scrollRef.current) return;
    scrollRef.current.scrollTo({ y: Math.max(0, y - 12), animated: true });
  }

  const loadRemarks = useCallback(async () => {
    if (!leadId || !Number.isSafeInteger(projectId) || projectId <= 0) {
      setRemarks([]);
      setRemarksError("Lead not found.");
      return;
    }
    setRemarksLoading(true);
    setRemarksError(null);
    try {
      const response = await api.getRemarks(projectId, leadId);
      setRemarks(Array.isArray(response.remarks) ? response.remarks : []);
    } catch (err) {
      const mapped = mapRemarksLoadError(
        err instanceof ApiClientError || err instanceof TypeError ? err : null
      );
      setRemarksError(mapped.message);
      if (mapped.clearAuth) {
        setError(mapped.message);
      }
    } finally {
      setRemarksLoading(false);
    }
  }, [leadId, projectId]);

  const loadTimeline = useCallback(async () => {
    if (!leadId || !Number.isSafeInteger(projectId) || projectId <= 0) {
      setTimelineEvents([]);
      setTimelineError("Lead not found.");
      return;
    }
    setTimelineLoading(true);
    setTimelineError(null);
    try {
      const response = await api.getLeadTimeline(projectId, leadId);
      setTimelineEvents(Array.isArray(response.events) ? response.events : []);
    } catch (err) {
      const mapped = mapTimelineLoadError(
        err instanceof ApiClientError || err instanceof TypeError ? err : null
      );
      setTimelineError(mapped.message);
      if (mapped.clearAuth) {
        setError(mapped.message);
      }
    } finally {
      setTimelineLoading(false);
    }
  }, [leadId, projectId]);

  const load = useCallback(async (mode: "initial" | "refresh" = "initial") => {
    if (!Number.isSafeInteger(projectId) || projectId <= 0 || !leadId) {
      setError("Lead not found.");
      setDetail(null);
      setLoading(false);
      return;
    }

    if (mode === "refresh") setRefreshing(true);
    else setLoading(true);
    setError(null);
    setForbidden(false);

    try {
      const projectData = await api.getProjectLeads(projectId);
      const result = buildLeadDetail(projectData, rowNumber);
      if (!result.found) {
        setDetail(null);
        setError("Lead not found.");
        setRemarks([]);
        setTimelineEvents([]);
        return;
      }
      setDetail(result);
      syncSelectionFromDetail(result);
      setStatusError(null);
      setRemarkMutationError(null);
      setFollowUpStatusError(null);
      setFollowUpRemarkError(null);
      setContactRemarkError(null);
      await Promise.all([loadRemarks(), loadTimeline()]);
    } catch (err) {
      if (err instanceof ApiClientError && err.status === 401) {
        setError("Session expired. Please login again.");
      } else if (err instanceof ApiClientError && err.status === 403) {
        setForbidden(true);
        setError("You don't have access to this project.");
      } else if (err instanceof ApiClientError && err.status === 404) {
        setError("Lead not found.");
      } else if (err instanceof TypeError) {
        setError("Please check your internet connection.");
      } else {
        setError("Unable to load lead.");
      }
      if (mode === "initial") setDetail(null);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [projectId, rowNumber, leadId, syncSelectionFromDetail, loadRemarks, loadTimeline]);

  useEffect(() => {
    void load("initial");
  }, [load]);

  const saveEnabled =
    detail != null &&
    canEnableSaveStatus({
      displayStatus: detail.status,
      selectedStatus,
      saving: savingStatus
    });

  async function onSaveStatus() {
    if (!detail || !selectedStatus || savingStatus) return;

    if (!shouldSubmitStatusChange(detail.status, selectedStatus)) {
      setStatusMessage("No status change.");
      setStatusError(null);
      return;
    }

    setSavingStatus(true);
    setStatusMessage(null);
    setStatusError(null);

    const previousDetail = detail;
    try {
      const response = await api.updateLeadStatus(projectId, rowNumber, selectedStatus);
      const result = await applyStatusUpdateResult(previousDetail, selectedStatus, response);
      if (result.unchanged) {
        setStatusMessage("No status change.");
        return;
      }
      setStatusMessage("Lead Status updated.");
      setFollowUpStatusMessage(null);
      setFollowUpStatusError(null);
    } catch (err) {
      const mapped = mapStatusUpdateError(err instanceof ApiClientError || err instanceof TypeError ? err : null);
      setStatusError(mapped.message);
      setDetail(previousDetail);
      syncSelectionFromDetail(previousDetail);
      if (mapped.clearAuth) {
        setError(mapped.message);
      }
    } finally {
      setSavingStatus(false);
    }
  }

  async function applyStatusUpdateResult(
    previousDetail: LeadDetailModel,
    selected: LeadStatusValue,
    response: {
      unchanged?: boolean;
      status?: string;
      project?: Parameters<typeof buildLeadDetail>[0];
    }
  ) {
    if (response.unchanged) {
      syncSelectionFromDetail(previousDetail);
      return { unchanged: true as const };
    }

    const nextStatus = (response.status || selected) as LeadStatusValue;
    if (response.project) {
      const refreshed = buildLeadDetail(response.project, rowNumber);
      if (refreshed.found) {
        setDetail(refreshed);
        syncSelectionFromDetail(refreshed);
      } else {
        const updated = applySuccessfulStatusUpdate(previousDetail, nextStatus);
        if (updated) {
          setDetail(updated);
          syncSelectionFromDetail(updated);
        }
      }
    } else {
      const updated = applySuccessfulStatusUpdate(previousDetail, nextStatus);
      if (updated) {
        setDetail(updated);
        syncSelectionFromDetail(updated);
      }
    }
    void loadTimeline();
    return { unchanged: false as const };
  }

  async function onMarkFollowUp() {
    if (!detail || savingStatus) return;

    if (!shouldMarkFollowUp(detail.status)) {
      setFollowUpStatusMessage(alreadyFollowUpMessage());
      setFollowUpStatusError(null);
      return;
    }

    setSavingStatus(true);
    setFollowUpStatusMessage(null);
    setFollowUpStatusError(null);
    setStatusMessage(null);
    setStatusError(null);

    const previousDetail = detail;
    try {
      const response = await api.updateLeadStatus(projectId, rowNumber, FOLLOW_UP_STATUS);
      const result = await applyStatusUpdateResult(previousDetail, FOLLOW_UP_STATUS, response);
      if (result.unchanged) {
        setFollowUpStatusMessage(alreadyFollowUpMessage());
        return;
      }
      setFollowUpStatusMessage(followUpSuccessMessage());
      setStatusMessage("Lead Status updated.");
    } catch (err) {
      const mapped = mapFollowUpStatusError(
        err instanceof ApiClientError || err instanceof TypeError ? err : null
      );
      setFollowUpStatusError(mapped.message);
      setDetail(previousDetail);
      syncSelectionFromDetail(previousDetail);
      if (mapped.clearAuth) setError(mapped.message);
      throw err;
    } finally {
      setSavingStatus(false);
    }
  }

  async function onAddRemark(body: string) {
    if (!leadId || remarkBusy) return;
    setRemarkBusy(true);
    setRemarkMutationError(null);
    setFollowUpRemarkError(null);
    try {
      const response = await api.addRemark(projectId, leadId, body);
      if (Array.isArray(response.remarks)) {
        setRemarks(response.remarks);
      } else if (response.remark) {
        setRemarks(prev => [response.remark, ...prev.filter(item => item.id !== response.remark.id)]);
      }
      void loadTimeline();
    } catch (err) {
      const mapped = mapRemarkMutationError(
        err instanceof ApiClientError || err instanceof TypeError ? err : null,
        "add"
      );
      setRemarkMutationError(mapped.message);
      if (mapped.clearAuth) setError(mapped.message);
      throw err;
    } finally {
      setRemarkBusy(false);
    }
  }

  async function onAddFollowUpRemark(body: string) {
    if (!leadId || remarkBusy) return;
    setRemarkBusy(true);
    setFollowUpRemarkMessage(null);
    setFollowUpRemarkError(null);
    setRemarkMutationError(null);
    setContactRemarkError(null);
    try {
      const response = await api.addRemark(projectId, leadId, body);
      if (Array.isArray(response.remarks)) {
        setRemarks(response.remarks);
      } else if (response.remark) {
        setRemarks(prev => [response.remark, ...prev.filter(item => item.id !== response.remark.id)]);
      }
      setFollowUpRemarkMessage(followUpRemarkSuccessMessage());
      void loadTimeline();
    } catch (err) {
      const mapped = mapFollowUpRemarkError(
        err instanceof ApiClientError || err instanceof TypeError ? err : null
      );
      setFollowUpRemarkError(mapped.message);
      if (mapped.clearAuth) setError(mapped.message);
      throw err;
    } finally {
      setRemarkBusy(false);
    }
  }

  async function onAddContactRemark(body: string) {
    if (!leadId || remarkBusy) return;
    setRemarkBusy(true);
    setContactRemarkMessage(null);
    setContactRemarkError(null);
    setRemarkMutationError(null);
    setFollowUpRemarkError(null);
    try {
      const response = await api.addRemark(projectId, leadId, body);
      if (Array.isArray(response.remarks)) {
        setRemarks(response.remarks);
      } else if (response.remark) {
        setRemarks(prev => [response.remark, ...prev.filter(item => item.id !== response.remark.id)]);
      }
      setContactRemarkMessage(contactRemarkSuccessMessage());
      void loadTimeline();
    } catch (err) {
      const mapped = mapContactRemarkError(
        err instanceof ApiClientError || err instanceof TypeError ? err : null
      );
      setContactRemarkError(mapped.message);
      if (mapped.clearAuth) setError(mapped.message);
      throw err;
    } finally {
      setRemarkBusy(false);
    }
  }

  async function onEditRemark(remarkId: number, body: string) {
    if (remarkBusy) return;
    setRemarkBusy(true);
    setRemarkMutationError(null);
    try {
      const response = await api.updateRemark(projectId, remarkId, body);
      if (Array.isArray(response.remarks)) {
        setRemarks(response.remarks);
      } else if (response.remark) {
        setRemarks(prev => prev.map(item => (item.id === remarkId ? response.remark : item)));
      }
      void loadTimeline();
    } catch (err) {
      const mapped = mapRemarkMutationError(
        err instanceof ApiClientError || err instanceof TypeError ? err : null,
        "edit"
      );
      setRemarkMutationError(mapped.message);
      if (mapped.clearAuth) setError(mapped.message);
      throw err;
    } finally {
      setRemarkBusy(false);
    }
  }

  async function onDeleteRemark(remarkId: number) {
    if (remarkBusy) return;
    setRemarkBusy(true);
    setRemarkMutationError(null);
    try {
      const response = await api.deleteRemark(projectId, remarkId);
      if (Array.isArray(response.remarks)) {
        setRemarks(response.remarks);
      } else {
        setRemarks(prev => prev.filter(item => item.id !== remarkId));
      }
      void loadTimeline();
    } catch (err) {
      const mapped = mapRemarkMutationError(
        err instanceof ApiClientError || err instanceof TypeError ? err : null,
        "delete"
      );
      setRemarkMutationError(mapped.message);
      if (mapped.clearAuth) setError(mapped.message);
    } finally {
      setRemarkBusy(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe} edges={["bottom"]}>
      <Stack.Screen options={{ title: detail?.name || "Lead" }} />

      {loading && !detail ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.accent} size="large" />
          <Text style={styles.centerText}>Loading lead...</Text>
        </View>
      ) : null}

      {error && !loading && !detail ? (
        <View style={styles.center}>
          <Text style={styles.error}>{error}</Text>
          {forbidden ? (
            <Pressable
              style={styles.button}
              accessibilityRole="button"
              accessibilityLabel="Back to projects"
              onPress={() => router.replace("/projects")}
            >
              <Text style={styles.buttonText}>Back to Projects</Text>
            </Pressable>
          ) : (
            <Pressable
              style={styles.button}
              accessibilityRole="button"
              accessibilityLabel="Retry loading lead"
              onPress={() => {
                void load("initial");
              }}
            >
              <Text style={styles.buttonText}>Retry</Text>
            </Pressable>
          )}
        </View>
      ) : null}

      {detail ? (
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          keyboardVerticalOffset={88}
        >
          <ScrollView
            ref={scrollRef}
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
            <View onLayout={event => rememberSection("header", event)}>
              <LeadDetailHeader
                projectName={detail.projectName}
                name={detail.name}
                phone={detail.phone}
                email={detail.email}
                status={detail.status}
              />
            </View>

            <View onLayout={event => rememberSection("intelligence", event)}>
              <LeadIntelligenceSummary
                status={detail.status}
                name={detail.name}
                phone={detail.phone}
                email={detail.email}
                telHref={detail.telHref}
                mailtoHref={detail.mailtoHref}
                timelineEvents={timelineEvents}
                remarks={remarks}
                onSelectNextStage={next => {
                  setSelectedStatus(next);
                  setStatusMessage(null);
                  setStatusError(null);
                  jumpToSection("status");
                }}
              />
            </View>

            <View onLayout={event => rememberSection("productivity", event)}>
              <LeadSmartNextAction
                status={detail.status}
                telHref={detail.telHref}
                waHref={detail.waHref}
                mailtoHref={detail.mailtoHref}
                timelineEvents={timelineEvents}
                onSelectQuickStatus={status => {
                  setSelectedStatus(status);
                  setStatusMessage(null);
                  setStatusError(null);
                  jumpToSection("status");
                }}
                onJumpToStatus={() => jumpToSection("status")}
              />
            </View>

            <LeadNextActions onJump={jumpToSection} />

            <View onLayout={event => rememberSection("contact", event)}>
              <LeadContactActions
                name={detail.name}
                telHref={detail.telHref}
                waHref={detail.waHref}
                mailtoHref={detail.mailtoHref}
              />
            </View>

            <View
              style={styles.section}
              onLayout={event => rememberSection("status", event)}
            >
              <Text style={styles.sectionTitle}>Lead Status</Text>
              <Text style={styles.currentStatus}>
                Current: {detail.status === "Unknown" || !detail.status ? "Unknown" : detail.status}
              </Text>

              <View style={styles.statusOptions} accessibilityRole="radiogroup">
                {LEAD_STATUSES.map(status => {
                  const selected = selectedStatus === status;
                  return (
                    <Pressable
                      key={status}
                      style={[styles.statusOption, selected && styles.statusOptionSelected]}
                      accessibilityRole="radio"
                      accessibilityState={{ selected, disabled: savingStatus }}
                      accessibilityLabel={`Lead Status ${status}`}
                      disabled={savingStatus}
                      onPress={() => {
                        setSelectedStatus(status);
                        setStatusMessage(null);
                        setStatusError(null);
                      }}
                    >
                      <Text style={[styles.statusOptionText, selected && styles.statusOptionTextSelected]}>
                        {status}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              <Pressable
                style={[styles.saveBtn, !saveEnabled && styles.saveBtnDisabled]}
                disabled={!saveEnabled}
                accessibilityRole="button"
                accessibilityLabel={savingStatus ? "Saving Lead Status" : "Save Status"}
                accessibilityState={{ disabled: !saveEnabled, busy: savingStatus }}
                onPress={() => {
                  void onSaveStatus();
                }}
              >
                {savingStatus ? (
                  <View style={styles.saveRow}>
                    <ActivityIndicator color={colors.bg} />
                    <Text style={styles.saveBtnText}>Saving...</Text>
                  </View>
                ) : (
                  <Text style={styles.saveBtnText}>Save Status</Text>
                )}
              </Pressable>

              {statusMessage ? <Text style={styles.statusSuccess}>{statusMessage}</Text> : null}
              {statusError ? <Text style={styles.statusFail}>{statusError}</Text> : null}
            </View>

            <View onLayout={event => rememberSection("followUp", event)}>
              <LeadFollowUpSection
                displayStatus={detail.status}
                statusSaving={savingStatus}
                remarkBusy={remarkBusy}
                statusMessage={followUpStatusMessage}
                statusError={followUpStatusError}
                remarkMessage={followUpRemarkMessage}
                remarkError={followUpRemarkError}
                onMarkFollowUp={onMarkFollowUp}
                onAddFollowUpRemark={onAddFollowUpRemark}
                onRetryStatus={() => {
                  void onMarkFollowUp();
                }}
              />
            </View>

            <View onLayout={event => rememberSection("contactRemark", event)}>
              <LeadContactRemarkSection
                busy={remarkBusy}
                message={contactRemarkMessage}
                error={contactRemarkError}
                onAdd={onAddContactRemark}
              />
            </View>

            <View onLayout={event => rememberSection("remarks", event)}>
              <LeadRemarksSection
                remarks={remarks}
                loading={remarksLoading}
                error={remarksError}
                busy={remarkBusy}
                user={user}
                onRetry={() => {
                  void loadRemarks();
                }}
                onAdd={onAddRemark}
                onEdit={onEditRemark}
                onDelete={onDeleteRemark}
              />
              {remarkMutationError ? <Text style={styles.statusFail}>{remarkMutationError}</Text> : null}
            </View>

            <View
              style={styles.fieldsSection}
              onLayout={event => rememberSection("fields", event)}
            >
              <Pressable
                style={styles.fieldsToggle}
                accessibilityRole="button"
                accessibilityState={{ expanded: fieldsExpanded }}
                accessibilityLabel={
                  fieldsExpanded ? "Collapse additional sheet fields" : "Expand additional sheet fields"
                }
                onPress={() => setFieldsExpanded(prev => !prev)}
              >
                <Text style={styles.sectionTitle}>Additional Sheet Fields</Text>
                <Text style={styles.fieldsToggleText}>
                  {fieldsExpanded ? "Hide" : `Show (${detail.fields.length})`}
                </Text>
              </Pressable>

              {fieldsExpanded ? (
                detail.fields.length === 0 ? (
                  <Text style={styles.centerText}>No additional fields.</Text>
                ) : (
                  detail.fields.map(field => (
                    <FieldRow key={field.header} label={field.header} value={field.value} />
                  ))
                )
              ) : (
                <Text style={styles.fieldsHint}>
                  Name, phone, email, and status are shown above. Expand to view remaining sheet columns.
                </Text>
              )}
            </View>

            <View onLayout={event => rememberSection("timeline", event)}>
              <LeadTimelineSection
                events={timelineEvents}
                loading={timelineLoading}
                error={timelineError}
                onRetry={() => {
                  void loadTimeline();
                }}
              />
            </View>

            {error ? <Text style={styles.inlineError}>{error}</Text> : null}
          </ScrollView>
        </KeyboardAvoidingView>
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
  content: { padding: 20, paddingBottom: 48 },
  section: { marginBottom: 16 },
  sectionTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 10
  },
  currentStatus: {
    color: colors.textSoft,
    fontSize: 14,
    marginBottom: 10,
    fontWeight: "600"
  },
  statusOptions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 14
  },
  statusOption: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    backgroundColor: colors.card,
    paddingHorizontal: 12,
    paddingVertical: 10,
    minHeight: 40,
    justifyContent: "center"
  },
  statusOptionSelected: {
    borderColor: colors.accent,
    backgroundColor: "#0C4A6E"
  },
  statusOptionText: { color: colors.textSoft, fontWeight: "600", fontSize: 13 },
  statusOptionTextSelected: { color: colors.accent },
  saveBtn: {
    backgroundColor: colors.accent,
    borderRadius: 10,
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16
  },
  saveBtnDisabled: { opacity: 0.4 },
  saveRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  saveBtnText: { color: colors.bg, fontWeight: "800", fontSize: 15 },
  statusSuccess: { marginTop: 10, color: colors.accent, fontSize: 13, fontWeight: "600" },
  statusFail: { marginTop: 10, color: colors.danger, fontSize: 13 },
  fieldsSection: { marginTop: 8, marginBottom: 16 },
  fieldsToggle: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 8
  },
  fieldsToggleText: { color: colors.accent, fontWeight: "800", fontSize: 13 },
  fieldsHint: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 4
  },
  fieldRow: {
    borderBottomWidth: 1,
    borderBottomColor: colors.cardBorder,
    paddingVertical: 12
  },
  fieldLabel: { color: colors.textMuted, fontSize: 12, fontWeight: "700", marginBottom: 4 },
  fieldValue: { color: colors.text, fontSize: 15, lineHeight: 22 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, padding: 24 },
  centerText: { color: colors.textMuted, textAlign: "center" },
  error: { color: colors.danger, textAlign: "center", fontSize: 15 },
  inlineError: { marginTop: 16, color: colors.danger, fontSize: 13 },
  button: {
    backgroundColor: colors.accent,
    borderRadius: 10,
    paddingHorizontal: 18,
    paddingVertical: 12,
    minHeight: 44,
    justifyContent: "center"
  },
  buttonText: { color: colors.bg, fontWeight: "700" }
});
