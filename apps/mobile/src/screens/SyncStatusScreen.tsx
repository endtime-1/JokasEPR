import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors, font, radius, shadow, spacing } from "../constants/theme";
import { getAllSubmissions, getRetryableSubmissions, markRetry, type PendingSubmission } from "../db/database";
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

const STATUS_META: Record<RowStatus, { color: string; bg: string; label: string; icon: string }> = {
  pending:  { color: "#d97706", bg: "#fffbeb", label: "Pending",     icon: "🕐" },
  synced:   { color: "#16a34a", bg: "#f0fdf4", label: "Synced",      icon: "✅" },
  error:    { color: "#dc2626", bg: "#fef2f2", label: "Failed",      icon: "❌" },
  maxRetry: { color: "#7c3aed", bg: "#f5f3ff", label: "Max Retries", icon: "⛔" },
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
          <Text style={styles.loadingText}>Loading sync status…</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={["bottom"]}>
      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>

        {/* Page header */}
        <View style={styles.pageHeader}>
          <View style={styles.pageIconWrap}>
            <Text style={styles.pageIconText}>🔄</Text>
          </View>
          <View style={styles.pageHeaderText}>
            <Text style={styles.pageTitle}>Sync Status</Text>
            <Text style={styles.pageSub}>Manage offline records and data sync</Text>
          </View>
        </View>

        {/* Connection card */}
        <View style={[styles.connectionCard, online ? styles.connectionOnline : styles.connectionOffline]}>
          <View style={styles.connectionLeft}>
            <View style={[styles.connectionDot, { backgroundColor: online ? "#22c55e" : "#dc2626" }]} />
            <View>
              <Text style={styles.connectionStatus}>{online ? "Connected" : "Offline"}</Text>
              {lastSyncAt && (
                <Text style={styles.connectionSub}>Last sync: {timeAgo(lastSyncAt.toISOString())}</Text>
              )}
            </View>
          </View>
          {lastResult && (
            <View style={styles.connectionRight}>
              <Text style={styles.syncResultText}>↑ {lastResult.synced} synced</Text>
              {lastResult.failed > 0 && (
                <Text style={[styles.syncResultText, { color: "#dc2626" }]}>✕ {lastResult.failed} failed</Text>
              )}
            </View>
          )}
        </View>

        {/* Stat counters */}
        <View style={styles.counters}>
          {([
            { key: "pending" as const,  count: pendingRows.length  },
            { key: "synced"  as const,  count: syncedRows.length   },
            { key: "error"   as const,  count: failedRows.length   },
          ]).map(({ key, count }) => {
            const meta = STATUS_META[key];
            return (
              <View key={key} style={[styles.counterCard, { borderColor: meta.color + "30" }]}>
                <Text style={styles.counterIcon}>{meta.icon}</Text>
                <Text style={[styles.counterNum, { color: meta.color }]}>{count}</Text>
                <Text style={styles.counterLabel}>{meta.label}</Text>
              </View>
            );
          })}
        </View>

        {/* Sync button */}
        <TouchableOpacity
          style={[styles.syncBtn, (syncing || !online) && styles.syncBtnDisabled]}
          onPress={handleManualSync}
          disabled={syncing || !online}
          activeOpacity={0.85}
        >
          {syncing
            ? <><ActivityIndicator size="small" color={colors.white} /><Text style={styles.syncBtnText}>Syncing…</Text></>
            : <Text style={styles.syncBtnText}>
                {online ? `Sync Now${pending > 0 ? ` (${pending} pending)` : ""}` : "Cannot sync while offline"}
              </Text>
          }
        </TouchableOpacity>

        {/* Pending rows */}
        {pendingRows.length > 0 && (
          <SubmissionSection title="Pending Upload" rows={pendingRows} retrying={retrying} />
        )}

        {/* Failed rows */}
        {failedRows.length > 0 && (
          <SubmissionSection title="Failed" rows={failedRows} retrying={retrying} onRetry={handleRetry} />
        )}

        {/* Synced rows */}
        {syncedRows.length > 0 && (
          <SubmissionSection title="Recently Synced" rows={syncedRows.slice(0, 10)} retrying={retrying} />
        )}

        {/* Empty */}
        {rows.length === 0 && (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyEmoji}>✅</Text>
            <Text style={styles.emptyTitle}>Everything is synced</Text>
            <Text style={styles.emptyDesc}>No offline submissions pending.</Text>
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
        <Text style={styles.sectionLabel}>{title.toUpperCase()}</Text>
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
                  <Text style={styles.submissionIcon}>{meta.icon}</Text>
                </View>
                <View style={styles.submissionInfo}>
                  <Text style={styles.submissionTitle}>{getLabel(row.endpoint)}</Text>
                  {row.sync_error && (
                    <Text style={styles.submissionError} numberOfLines={1}>{row.sync_error}</Text>
                  )}
                  <Text style={styles.submissionMeta}>
                    {timeAgo(row.created_at)}
                    {row.attempts > 0 ? ` · ${row.attempts} attempt${row.attempts !== 1 ? "s" : ""}` : ""}
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
  loadingText: { fontSize: font.size.sm, color: colors.inkLight },

  pageHeader: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  pageIconWrap: {
    width: 52, height: 52, borderRadius: radius.lg,
    backgroundColor: colors.brandLight, borderWidth: 1, borderColor: colors.brandMid,
    alignItems: "center", justifyContent: "center",
  },
  pageIconText: { fontSize: 26 },
  pageHeaderText: { gap: 2 },
  pageTitle: { fontSize: font.size.xl, fontWeight: font.weight.extrabold, color: colors.ink },
  pageSub: { fontSize: font.size.sm, color: colors.inkLight },

  connectionCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderRadius: radius.xl,
    padding: spacing.lg,
    borderWidth: 1,
    ...shadow.sm,
  },
  connectionOnline: { backgroundColor: "#f0fdf4", borderColor: "#86efac" },
  connectionOffline: { backgroundColor: "#fef2f2", borderColor: "#fca5a5" },
  connectionLeft: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  connectionDot: { width: 12, height: 12, borderRadius: 6 },
  connectionStatus: { fontSize: font.size.md, fontWeight: font.weight.bold, color: colors.ink },
  connectionSub: { fontSize: font.size.xs, color: colors.inkMid },
  connectionRight: { alignItems: "flex-end", gap: 2 },
  syncResultText: { fontSize: font.size.xs, color: colors.inkMid, fontWeight: font.weight.medium },

  counters: { flexDirection: "row", gap: spacing.sm },
  counterCard: {
    flex: 1,
    alignItems: "center",
    backgroundColor: colors.bgCard,
    borderRadius: radius.lg,
    paddingVertical: spacing.md,
    borderWidth: 1,
    gap: 3,
    ...shadow.sm,
  },
  counterIcon: { fontSize: 20 },
  counterNum: { fontSize: font.size.xxl, fontWeight: font.weight.extrabold },
  counterLabel: { fontSize: font.size.xs, color: colors.inkLight, fontWeight: font.weight.medium },

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
  syncBtnText: { color: colors.white, fontSize: font.size.md, fontWeight: font.weight.bold },

  section: { gap: spacing.sm },
  sectionLabelRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  sectionLabel: { fontSize: font.size.xs, fontWeight: font.weight.bold, color: colors.inkLight, letterSpacing: 1 },
  sectionLine: { flex: 1, height: 1, backgroundColor: colors.border },
  sectionCount: {
    minWidth: 22, height: 22, borderRadius: 11,
    backgroundColor: colors.brand + "20", alignItems: "center", justifyContent: "center", paddingHorizontal: 6,
  },
  sectionCountText: { fontSize: font.size.xs, fontWeight: font.weight.bold, color: colors.brand },

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
  submissionIcon: { fontSize: 18 },
  submissionInfo: { flex: 1, gap: 2 },
  submissionTitle: { fontSize: font.size.sm, fontWeight: font.weight.semibold, color: colors.ink },
  submissionError: { fontSize: font.size.xs, color: "#dc2626" },
  submissionMeta: { fontSize: font.size.xs, color: colors.inkLight },
  submissionRight: { alignItems: "flex-end", gap: spacing.xs },
  statusPill: { paddingHorizontal: spacing.sm, paddingVertical: 3, borderRadius: radius.full },
  statusPillText: { fontSize: font.size.xs, fontWeight: font.weight.bold },
  retryBtn: {
    paddingHorizontal: spacing.md, paddingVertical: 4,
    backgroundColor: colors.brandLight, borderRadius: radius.full,
    borderWidth: 1, borderColor: colors.brandMid,
  },
  retryBtnText: { fontSize: font.size.xs, fontWeight: font.weight.bold, color: colors.brand },

  emptyCard: {
    backgroundColor: colors.brandLight,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.brandMid,
    padding: spacing.xxxl,
    alignItems: "center",
    gap: spacing.md,
  },
  emptyEmoji: { fontSize: 40 },
  emptyTitle: { fontSize: font.size.lg, fontWeight: font.weight.bold, color: colors.brandDark },
  emptyDesc: { fontSize: font.size.sm, color: colors.brand, textAlign: "center" },
});
