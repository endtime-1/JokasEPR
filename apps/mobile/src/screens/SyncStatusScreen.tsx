import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Card } from "../components/Card";
import { Button } from "../components/Button";
import { colors, font, radius, spacing } from "../constants/theme";
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
  "sales-orders": "Sales Order"
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

const STATUS_COLOR: Record<RowStatus, string> = {
  pending: "#f59e0b",
  synced: "#16a34a",
  error: "#dc2626",
  maxRetry: "#7c3aed"
};

const STATUS_LABEL: Record<RowStatus, string> = {
  pending: "Pending",
  synced: "Synced",
  error: "Failed",
  maxRetry: "Max Retries"
};

export function SyncStatusScreen() {
  const [rows, setRows] = useState<PendingSubmission[]>([]);
  const [loading, setLoading] = useState(true);
  const [retrying, setRetrying] = useState<Set<string>>(new Set());
  const { pending, syncing, lastSyncAt, lastResult, sync } = useSync();
  const { online } = useNetwork();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const all = await getAllSubmissions();
      setRows(all);
    } finally {
      setLoading(false);
    }
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
      // Reset local retry counter so it can be picked up by next sync
      await markRetry(row.id);
      // Also attempt server-side retry for already-recorded failures
      if (online) {
        await retrySyncRecord(row.id).catch(() => undefined);
        await sync();
      }
      await load();
    } finally {
      setRetrying((s) => { const n = new Set(s); n.delete(row.id); return n; });
    }
  }

  const pendingRows = rows.filter((r) => deriveStatus(r) === "pending");
  const errorRows = rows.filter((r) => deriveStatus(r) === "error");
  const maxRetryRows = rows.filter((r) => deriveStatus(r) === "maxRetry");
  const syncedRows = rows.filter((r) => deriveStatus(r) === "synced");

  if (loading) {
    return (
      <SafeAreaView style={styles.safe} edges={["bottom"]}>
        <View style={styles.center}><ActivityIndicator size="large" color={colors.brand} /></View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={["bottom"]}>
      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
        {/* Connection + last sync */}
        <Card style={styles.statusCard}>
          <View style={styles.statusRow}>
            <View style={[styles.indicator, { backgroundColor: online ? "#16a34a" : "#dc2626" }]} />
            <Text style={styles.statusText}>{online ? "Online" : "Offline"}</Text>
          </View>
          <View style={{ alignItems: "flex-end" }}>
            {lastSyncAt && <Text style={styles.lastSync}>Last sync: {timeAgo(lastSyncAt.toISOString())}</Text>}
            {lastResult && (
              <Text style={styles.lastSync}>
                ↑ {lastResult.synced} synced · {lastResult.failed} failed
              </Text>
            )}
          </View>
        </Card>

        {/* Counters */}
        <View style={styles.counters}>
          {([
            { key: "pending" as const, count: pendingRows.length },
            { key: "synced" as const, count: syncedRows.length },
            { key: "error" as const, count: errorRows.length + maxRetryRows.length }
          ]).map(({ key, count }) => (
            <Card key={key} style={styles.counterCard}>
              <Text style={[styles.counterNum, { color: STATUS_COLOR[key] }]}>{count}</Text>
              <Text style={styles.counterLabel}>{STATUS_LABEL[key]}</Text>
            </Card>
          ))}
        </View>

        <Button
          label={syncing ? "Syncing…" : `Sync Now${pending > 0 ? ` (${pending})` : ""}`}
          loading={syncing}
          disabled={syncing || !online}
          onPress={handleManualSync}
          size="lg"
        />

        {pendingRows.length > 0 && (
          <>
            <Text style={styles.sectionLabel}>Pending Upload</Text>
            {pendingRows.map((r) => <SubmissionRow key={r.id} row={r} status="pending" />)}
          </>
        )}

        {(errorRows.length > 0 || maxRetryRows.length > 0) && (
          <>
            <Text style={styles.sectionLabel}>Failed</Text>
            {[...errorRows, ...maxRetryRows].map((r) => (
              <SubmissionRow
                key={r.id}
                row={r}
                status={deriveStatus(r)}
                onRetry={() => handleRetry(r)}
                retrying={retrying.has(r.id)}
              />
            ))}
          </>
        )}

        {syncedRows.length > 0 && (
          <>
            <Text style={styles.sectionLabel}>Recently Synced</Text>
            {syncedRows.slice(0, 10).map((r) => (
              <SubmissionRow key={r.id} row={r} status="synced" />
            ))}
          </>
        )}

        {rows.length === 0 && (
          <Card style={styles.emptyCard}>
            <Text style={styles.emptyIcon}>✅</Text>
            <Text style={styles.emptyTitle}>All synced</Text>
            <Text style={styles.emptyDesc}>No offline submissions pending.</Text>
          </Card>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function SubmissionRow({
  row,
  status,
  onRetry,
  retrying
}: {
  row: PendingSubmission;
  status: RowStatus;
  onRetry?: () => void;
  retrying?: boolean;
}) {
  const color = STATUS_COLOR[status];
  return (
    <Card style={styles.row}>
      <View style={styles.rowLeft}>
        <Text style={styles.rowTitle}>{getLabel(row.endpoint)}</Text>
        {row.sync_error && <Text style={styles.errorMsg} numberOfLines={1}>{row.sync_error}</Text>}
        <Text style={styles.rowMeta}>
          {timeAgo(row.created_at)}
          {row.attempts > 0 ? ` · ${row.attempts} attempt${row.attempts !== 1 ? "s" : ""}` : ""}
          {row.record_id ? ` · ID: ${row.record_id.slice(0, 8)}` : ""}
        </Text>
      </View>
      <View style={styles.rowRight}>
        <View style={[styles.badge, { backgroundColor: color + "22" }]}>
          <Text style={[styles.badgeText, { color }]}>{STATUS_LABEL[status]}</Text>
        </View>
        {onRetry && (
          <TouchableOpacity onPress={onRetry} disabled={retrying} style={styles.retryBtn}>
            <Text style={styles.retryText}>{retrying ? "…" : "Retry"}</Text>
          </TouchableOpacity>
        )}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  container: { padding: spacing.xl, gap: spacing.md, paddingBottom: spacing.xxxl },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  statusCard: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  statusRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  indicator: { width: 10, height: 10, borderRadius: 5 },
  statusText: { fontSize: font.size.md, fontWeight: font.weight.semibold, color: colors.ink },
  lastSync: { fontSize: font.size.xs, color: colors.inkMid },
  counters: { flexDirection: "row", gap: spacing.sm },
  counterCard: { flex: 1, alignItems: "center", gap: spacing.xs },
  counterNum: { fontSize: font.size.xxl, fontWeight: font.weight.bold },
  counterLabel: { fontSize: font.size.xs, color: colors.inkMid, fontWeight: font.weight.medium },
  sectionLabel: { fontSize: font.size.xs, fontWeight: font.weight.bold, color: colors.inkMid, textTransform: "uppercase", letterSpacing: 0.5, marginTop: spacing.sm },
  row: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: spacing.sm },
  rowLeft: { flex: 1, gap: 2 },
  rowRight: { alignItems: "flex-end", gap: spacing.xs },
  rowTitle: { fontSize: font.size.sm, fontWeight: font.weight.medium, color: colors.ink },
  rowMeta: { fontSize: font.size.xs, color: colors.inkLight },
  errorMsg: { fontSize: font.size.xs, color: "#dc2626" },
  badge: { paddingHorizontal: spacing.sm, paddingVertical: 2, borderRadius: radius.full },
  badgeText: { fontSize: font.size.xs, fontWeight: font.weight.bold },
  retryBtn: { paddingHorizontal: spacing.sm, paddingVertical: 3, backgroundColor: colors.brand + "15", borderRadius: radius.sm },
  retryText: { fontSize: font.size.xs, fontWeight: font.weight.bold, color: colors.brand },
  emptyCard: { alignItems: "center", gap: spacing.sm, paddingVertical: spacing.xxxl, backgroundColor: colors.brandLight },
  emptyIcon: { fontSize: 40 },
  emptyTitle: { fontSize: font.size.lg, fontWeight: font.weight.bold, color: colors.ink },
  emptyDesc: { fontSize: font.size.sm, color: colors.inkMid }
});
