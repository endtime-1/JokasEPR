import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { colors, font, radius, shadow, spacing } from "../constants/theme";
import { getAllSubmissions, markRetry, type PendingSubmission } from "../db/database";
import { retrySyncRecord } from "../api/endpoints";
import { useSync } from "../hooks/useSync";
import { useNetwork } from "../hooks/useNetwork";

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

const ENDPOINT_LABELS: Record<string, string> = {
  "daily-records": "Daily Poultry Record",
  "mortality-records": "Mortality Record",
  "egg-production-records": "Egg Production",
  "feed-consumption-records": "Feed Consumption",
  "medication-records": "Medication Record",
  "vaccination-records": "Vaccination Record",
  "stock-movements": "Stock Movement",
  "tasks": "Task Update",
  "sales-orders": "Sales Order",
};

type MCName = React.ComponentProps<typeof MaterialCommunityIcons>["name"];

function getLabel(endpoint: string) {
  const key = Object.keys(ENDPOINT_LABELS).find((k) => endpoint.includes(k));
  return key ? ENDPOINT_LABELS[key] : endpoint.split("/").filter(Boolean).pop() ?? endpoint;
}

type RowStatus = "pending" | "error" | "maxRetry" | "synced";

function deriveStatus(row: PendingSubmission): RowStatus {
  if (row.synced === 1) return "synced";
  if (row.attempts >= 5) return "maxRetry";
  if (row.sync_error) return "error";
  return "pending";
}

const STATUS_META: Record<RowStatus, { color: string; bg: string; label: string; icon: MCName }> = {
  pending:  { color: "#D97706", bg: "#FFFBEB", label: "Pending",     icon: "clock-outline" },
  synced:   { color: "#10B981", bg: "#ECFDF5", label: "Synced",      icon: "check-circle-outline" },
  error:    { color: "#EF4444", bg: "#FEF2F2", label: "Failed",      icon: "close-circle-outline" },
  maxRetry: { color: "#8B5CF6", bg: "#F5F3FF", label: "Max Retries", icon: "alert-octagon-outline" },
};

export function SyncStatusScreen() {
  const [rows, setRows] = useState<PendingSubmission[]>([]);
  const [loading, setLoading] = useState(true);
  const [retrying, setRetrying] = useState<Set<string>>(new Set());
  const { pending, syncing, lastSyncAt, lastResult, sync } = useSync();
  const { online } = useNetwork();

  const load = useCallback(async () => {
    setLoading(true);
    try { setRows(await getAllSubmissions()); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleManualSync() {
    if (!online) {
      Alert.alert("Offline", "Cannot sync while offline. Please check your connection.");
      return;
    }
    await sync();
    await load();
  }

  async function handleRetry(row: PendingSubmission) {
    setRetrying((s) => new Set(s).add(row.id));
    try {
      await markRetry(row.id);
      if (online) { await retrySyncRecord(row.id).catch(() => undefined); await sync(); }
      await load();
    } finally {
      setRetrying((s) => { const n = new Set(s); n.delete(row.id); return n; });
    }
  }

  const pendingRows  = rows.filter((r) => deriveStatus(r) === "pending");
  const errorRows    = rows.filter((r) => deriveStatus(r) === "error");
  const maxRetryRows = rows.filter((r) => deriveStatus(r) === "maxRetry");
  const syncedRows   = rows.filter((r) => deriveStatus(r) === "synced");
  const failedRows   = [...errorRows, ...maxRetryRows];

  if (loading) {
    return (
      <SafeAreaView style={styles.safe} edges={["bottom"]}>
        <View style={styles.loadingScreen}>
          <ActivityIndicator size="large" color={colors.brand} />
          <Text style={styles.loadingText}>Retrieving sync status logs…</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={["bottom"]}>
      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>

        {/* Page Header */}
        <View style={styles.pageHeader}>
          <View style={styles.pageIconWrap}>
            <MaterialCommunityIcons name="cloud-sync-outline" size={26} color={colors.brand} />
          </View>
          <View style={styles.pageHeaderText}>
            <Text style={styles.pageTitle}>Sync Manager</Text>
            <Text style={styles.pageSub}>Monitor and force upload offline farm logs</Text>
          </View>
        </View>

        {/* Connection telemetry card */}
        <View style={[styles.connectionCard, online ? styles.connectionOnline : styles.connectionOffline]}>
          <View style={styles.connectionLeft}>
            <View style={[styles.connectionDot, { backgroundColor: online ? "#10B981" : "#EF4444" }]} />
            <View style={{ gap: 2 }}>
              <Text style={styles.connectionStatus}>{online ? "Connected to Server" : "Offline Mode"}</Text>
              {lastSyncAt && (
                <Text style={styles.connectionSub}>Last verified: {timeAgo(lastSyncAt.toISOString())}</Text>
              )}
            </View>
          </View>
          {lastResult && (
            <View style={styles.connectionRight}>
              <Text style={styles.syncResultText}>↑ {lastResult.synced} synced</Text>
              {lastResult.failed > 0 && (
                <Text style={[styles.syncResultText, { color: colors.error }]}>✕ {lastResult.failed} failed</Text>
              )}
            </View>
          )}
        </View>

        {/* Sync Summary Counters */}
        <View style={styles.counters}>
          {([
            { key: "pending" as const,  count: pendingRows.length,  label: "Queueing" },
            { key: "synced"  as const,  count: syncedRows.length,   label: "Completed" },
            { key: "error"   as const,  count: failedRows.length,   label: "Unresolved" },
          ]).map(({ key, count, label }) => {
            const meta = STATUS_META[key];
            return (
              <View key={key} style={[styles.counterCard, { borderColor: meta.color + "20" }]}>
                <MaterialCommunityIcons name={meta.icon} size={22} color={meta.color} />
                <Text style={[styles.counterNum, { color: meta.color }]}>{count}</Text>
                <Text style={styles.counterLabel}>{label}</Text>
              </View>
            );
          })}
        </View>

        {/* Force Sync button */}
        <TouchableOpacity
          style={[styles.syncBtn, (syncing || !online) && styles.syncBtnDisabled]}
          onPress={handleManualSync}
          disabled={syncing || !online}
          activeOpacity={0.85}
        >
          {syncing ? (
            <>
              <ActivityIndicator size="small" color={colors.white} />
              <Text style={styles.syncBtnText}>Synchronizing Queue…</Text>
            </>
          ) : (
            <>
              <MaterialCommunityIcons name="sync" size={18} color={colors.white} />
              <Text style={styles.syncBtnText}>
                {online ? `Force Sync Queue${pending > 0 ? ` (${pending} items)` : ""}` : "Sync Disabled Offline"}
              </Text>
            </>
          )}
        </TouchableOpacity>

        {/* Pending rows */}
        {pendingRows.length > 0 && (
          <SubmissionSection title="Queueing Submissions" rows={pendingRows} retrying={retrying} />
        )}

        {/* Failed rows */}
        {failedRows.length > 0 && (
          <SubmissionSection title="Failed Entries" rows={failedRows} retrying={retrying} onRetry={handleRetry} />
        )}

        {/* Synced rows */}
        {syncedRows.length > 0 && (
          <SubmissionSection title="Recent Successful Syncs" rows={syncedRows.slice(0, 10)} retrying={retrying} />
        )}

        {/* Empty State */}
        {rows.length === 0 && (
          <View style={styles.emptyCard}>
            <View style={styles.emptyIconCircle}>
              <MaterialCommunityIcons name="check-all" size={32} color="#10B981" />
            </View>
            <Text style={styles.emptyTitle}>All Records Synced</Text>
            <Text style={styles.emptyDesc}>No offline submissions pending queue execution.</Text>
          </View>
        )}

      </ScrollView>
    </SafeAreaView>
  );
}

function SubmissionSection({ title, rows, retrying, onRetry }: {
  title: string;
  rows: PendingSubmission[];
  retrying: Set<string>;
  onRetry?: (row: PendingSubmission) => void;
}) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionLabelRow}>
        <Text style={styles.sectionLabel}>{title}</Text>
        <View style={styles.sectionLine} />
        <View style={styles.sectionCount}><Text style={styles.sectionCountText}>{rows.length}</Text></View>
      </View>

      <View style={styles.sectionCard}>
        {rows.map((row, idx) => {
          const status = deriveStatus(row);
          const meta = STATUS_META[status];
          return (
            <View key={row.id}>
              {idx > 0 && <View style={styles.rowDivider} />}
              <View style={styles.submissionRow}>
                <View style={[styles.submissionIconWrap, { backgroundColor: meta.bg }]}>
                  <MaterialCommunityIcons name={meta.icon} size={18} color={meta.color} />
                </View>
                <View style={styles.submissionInfo}>
                  <Text style={styles.submissionTitle}>{getLabel(row.endpoint)}</Text>
                  {row.sync_error && (
                    <Text style={styles.submissionError} numberOfLines={1}>{row.sync_error}</Text>
                  )}
                  <Text style={styles.submissionMeta}>
                    {timeAgo(row.created_at)}
                    {row.attempts > 0 ? ` · Attempt ${row.attempts}/5` : ""}
                  </Text>
                </View>
                <View style={styles.submissionRight}>
                  <View style={[styles.statusPill, { backgroundColor: meta.bg }]}>
                    <Text style={[styles.statusPillText, { color: meta.color }]}>{meta.label}</Text>
                  </View>
                  {onRetry && (
                    <TouchableOpacity
                      onPress={() => onRetry(row)}
                      disabled={retrying.has(row.id)}
                      style={styles.retryBtn}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.retryBtnText}>{retrying.has(row.id) ? "…" : "Retry"}</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  container: { padding: spacing.xl, gap: spacing.lg, paddingBottom: spacing.xxxl },
  loadingScreen: { flex: 1, alignItems: "center", justifyContent: "center", gap: spacing.md },
  loadingText: { fontSize: font.size.sm, color: colors.inkLight, fontFamily: font.family.medium },

  pageHeader: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  pageIconWrap: {
    width: 52,
    height: 52,
    borderRadius: radius.lg,
    backgroundColor: colors.brandLight,
    borderWidth: 1,
    borderColor: colors.brandMid,
    alignItems: "center",
    justifyContent: "center",
    ...shadow.sm,
  },
  pageHeaderText: { gap: 2 },
  pageTitle: { fontSize: font.size.xl, fontFamily: font.family.extrabold, color: colors.ink },
  pageSub: { fontSize: font.size.sm, color: colors.inkLight, fontFamily: font.family.regular },

  connectionCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderRadius: radius.xl,
    padding: spacing.lg,
    borderWidth: 1,
    ...shadow.sm,
  },
  connectionOnline: { backgroundColor: colors.successBg, borderColor: "#A7F3D0" },
  connectionOffline: { backgroundColor: colors.errorBg, borderColor: "#FECACA" },
  connectionLeft: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  connectionDot: { width: 10, height: 10, borderRadius: 5 },
  connectionStatus: { fontSize: font.size.md - 1, fontFamily: font.family.bold, color: colors.ink },
  connectionSub: { fontSize: font.size.xs, color: colors.inkMid, fontFamily: font.family.medium },
  connectionRight: { alignItems: "flex-end", gap: 2 },
  syncResultText: { fontSize: font.size.xs, color: colors.inkMid, fontFamily: font.family.semibold },

  counters: { flexDirection: "row", gap: spacing.sm },
  counterCard: {
    flex: 1,
    alignItems: "center",
    backgroundColor: colors.bgCard,
    borderRadius: radius.lg,
    paddingVertical: spacing.md,
    borderWidth: 1,
    gap: 4,
    ...shadow.sm,
  },
  counterNum: { fontSize: font.size.xl, fontFamily: font.family.extrabold },
  counterLabel: { fontSize: font.size.xs - 1, color: colors.inkLight, fontFamily: font.family.bold },

  syncBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    backgroundColor: colors.brand,
    borderRadius: radius.full,
    minHeight: 52,
    ...shadow.brand,
  },
  syncBtnDisabled: { opacity: 0.55 },
  syncBtnText: { color: colors.white, fontSize: font.size.md - 1, fontFamily: font.family.bold },

  section: { gap: spacing.sm, marginTop: spacing.xs },
  sectionLabelRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  sectionLabel: { fontSize: font.size.xs, fontFamily: font.family.bold, color: colors.inkLight, letterSpacing: 1.2, textTransform: "uppercase" },
  sectionLine: { flex: 1, height: 1, backgroundColor: colors.border },
  sectionCount: {
    minWidth: 22, height: 22, borderRadius: 11,
    backgroundColor: colors.brandLight, alignItems: "center", justifyContent: "center", paddingHorizontal: 6,
    borderWidth: 1, borderColor: colors.brandMid,
  },
  sectionCountText: { fontSize: 10, fontFamily: font.family.bold, color: colors.brand },

  sectionCard: {
    backgroundColor: colors.bgCard,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: "hidden",
    ...shadow.sm,
  },
  rowDivider: { height: 1, backgroundColor: colors.border, marginLeft: spacing.xl },
  submissionRow: { flexDirection: "row", alignItems: "center", padding: spacing.lg, gap: spacing.md },
  submissionIconWrap: { width: 40, height: 40, borderRadius: radius.md, alignItems: "center", justifyContent: "center" },
  submissionInfo: { flex: 1, gap: 2 },
  submissionTitle: { fontSize: font.size.sm, fontFamily: font.family.bold, color: colors.ink },
  submissionError: { fontSize: font.size.xs, color: colors.error, fontFamily: font.family.medium },
  submissionMeta: { fontSize: font.size.xs, color: colors.inkLight, fontFamily: font.family.regular },
  submissionRight: { alignItems: "flex-end", gap: spacing.xs },
  statusPill: { paddingHorizontal: spacing.md, paddingVertical: 3, borderRadius: radius.full },
  statusPillText: { fontSize: 10, fontFamily: font.family.bold },
  retryBtn: {
    paddingHorizontal: spacing.md, paddingVertical: 5,
    backgroundColor: colors.brandLight, borderRadius: radius.full,
    borderWidth: 1, borderColor: colors.brandMid,
  },
  retryBtnText: { fontSize: font.size.xs - 1, fontFamily: font.family.bold, color: colors.brand },

  emptyCard: {
    backgroundColor: colors.successBg,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: "#A7F3D0",
    padding: spacing.xxxl,
    alignItems: "center",
    gap: spacing.md,
    ...shadow.sm,
  },
  emptyIconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.white,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#A7F3D0",
  },
  emptyTitle: { fontSize: font.size.lg - 1, fontFamily: font.family.bold, color: "#065F46" },
  emptyDesc: { fontSize: font.size.sm, color: "#065F46", fontFamily: font.family.medium, textAlign: "center" },
});
