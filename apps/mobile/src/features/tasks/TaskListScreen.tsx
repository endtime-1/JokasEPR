import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { SyncBanner } from "../../components/SyncBanner";
import { fetchMyTasks, type Task } from "../../api/endpoints";
import { colors, font, radius, shadow, spacing } from "../../constants/theme";

const PRIORITY_META: Record<string, { color: string; bg: string; label: string }> = {
  CRITICAL: { color: "#dc2626", bg: "#fef2f2", label: "Critical" },
  HIGH:     { color: "#d97706", bg: "#fffbeb", label: "High"     },
  MEDIUM:   { color: "#2563eb", bg: "#eff6ff", label: "Medium"   },
  LOW:      { color: "#64748b", bg: "#f8fafc", label: "Low"      },
};

const STATUS_META: Record<string, { color: string; bg: string; label: string }> = {
  COMPLETED:   { color: "#16a34a", bg: "#f0fdf4", label: "Completed"   },
  IN_PROGRESS: { color: "#d97706", bg: "#fffbeb", label: "In Progress" },
  PENDING:     { color: "#64748b", bg: "#f8fafc", label: "Pending"     },
  BLOCKED:     { color: "#dc2626", bg: "#fef2f2", label: "Blocked"     },
  CANCELLED:   { color: "#94a3b8", bg: "#f8fafc", label: "Cancelled"   },
};

function isPastDue(dueDate?: string) {
  if (!dueDate) return false;
  return new Date(dueDate) < new Date();
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

export function TaskListScreen() {
  const navigation = useNavigation<any>();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeFilter, setActiveFilter] = useState<"all" | "pending" | "done">("all");

  const load = useCallback(async (isRefresh = false) => {
    if (!isRefresh) setLoading(true);
    else setRefreshing(true);
    try {
      const res = await fetchMyTasks();
      setTasks((res.data as any) ?? []);
    } catch {
      //
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const pending = tasks.filter((t) => t.status !== "COMPLETED" && t.status !== "CANCELLED");
  const done    = tasks.filter((t) => t.status === "COMPLETED" || t.status === "CANCELLED");

  const filtered =
    activeFilter === "pending" ? pending :
    activeFilter === "done"    ? done    :
    tasks;

  if (loading) {
    return (
      <SafeAreaView style={styles.safe} edges={["bottom"]}>
        <View style={styles.loadingScreen}>
          <ActivityIndicator size="large" color={colors.brand} />
          <Text style={styles.loadingText}>Loading tasks…</Text>
        </View>
      </SafeAreaView>
    );
  }

  function renderTask({ item }: { item: Task }) {
    const pastDue = isPastDue(item.dueDate) && item.status !== "COMPLETED";
    const pMeta = PRIORITY_META[item.priority] ?? PRIORITY_META.LOW;
    const sMeta = STATUS_META[item.status] ?? STATUS_META.PENDING;

    return (
      <TouchableOpacity
        onPress={() => navigation.navigate("TaskUpdate", { taskId: item.id, taskTitle: item.title })}
        activeOpacity={0.78}
      >
        <View style={styles.taskCard}>
          {/* priority accent bar */}
          <View style={[styles.priorityBar, { backgroundColor: pMeta.color }]} />

          <View style={styles.taskInner}>
            <View style={styles.taskTop}>
              <Text style={styles.taskTitle} numberOfLines={2}>{item.title}</Text>
              <View style={[styles.badge, { backgroundColor: sMeta.bg }]}>
                <Text style={[styles.badgeText, { color: sMeta.color }]}>{sMeta.label}</Text>
              </View>
            </View>

            {item.description && (
              <Text style={styles.taskDesc} numberOfLines={2}>{item.description}</Text>
            )}

            <View style={styles.taskMeta}>
              <View style={[styles.badge, { backgroundColor: pMeta.bg }]}>
                <Text style={[styles.badgeText, { color: pMeta.color }]}>{pMeta.label}</Text>
              </View>
              {item.farm && (
                <View style={styles.metaChip}>
                  <Text style={styles.metaChipText}>📍 {item.farm.name}</Text>
                </View>
              )}
              {item.dueDate && (
                <View style={[styles.metaChip, pastDue && styles.pastDueChip]}>
                  <Text style={[styles.metaChipText, pastDue && styles.pastDueText]}>
                    {pastDue ? "⚠ OVERDUE · " : "📅 "}{formatDate(item.dueDate)}
                  </Text>
                </View>
              )}
            </View>
          </View>
        </View>
      </TouchableOpacity>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={["bottom"]}>
      <SyncBanner />

      <FlatList
        data={filtered}
        renderItem={renderTask}
        keyExtractor={(t) => t.id}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={colors.brand} />}
        ItemSeparatorComponent={() => <View style={{ height: spacing.sm }} />}
        ListHeaderComponent={
          <View style={styles.listHeader}>
            {/* Page title */}
            <View style={styles.pageHeader}>
              <View style={styles.pageIconWrap}>
                <Text style={styles.pageIconText}>✅</Text>
              </View>
              <View>
                <Text style={styles.pageTitle}>My Tasks</Text>
                <Text style={styles.pageSub}>{tasks.length} task{tasks.length !== 1 ? "s" : ""} assigned to you</Text>
              </View>
            </View>

            {/* Stat chips */}
            <View style={styles.statRow}>
              <StatChip label="Pending" count={pending.length} color="#d97706" bg="#fffbeb" />
              <StatChip label="Done" count={done.length} color="#16a34a" bg="#f0fdf4" />
              <StatChip label="Total" count={tasks.length} color={colors.brand} bg={colors.brandLight} />
            </View>

            {/* Filter tabs */}
            <View style={styles.filterRow}>
              {(["all", "pending", "done"] as const).map((f) => (
                <TouchableOpacity
                  key={f}
                  style={[styles.filterTab, activeFilter === f && styles.filterTabActive]}
                  onPress={() => setActiveFilter(f)}
                >
                  <Text style={[styles.filterTabText, activeFilter === f && styles.filterTabTextActive]}>
                    {f === "all" ? "All" : f === "pending" ? "Active" : "Done"}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <View style={styles.emptyIconWrap}>
              <Text style={styles.emptyIconText}>✅</Text>
            </View>
            <Text style={styles.emptyTitle}>
              {activeFilter === "pending" ? "No active tasks" : activeFilter === "done" ? "No completed tasks" : "No tasks assigned"}
            </Text>
            <Text style={styles.emptyDesc}>
              {activeFilter === "all" ? "You're all caught up!" : "Try switching the filter above"}
            </Text>
          </View>
        }
      />
    </SafeAreaView>
  );
}

function StatChip({ label, count, color, bg }: { label: string; count: number; color: string; bg: string }) {
  return (
    <View style={[styles.statChip, { backgroundColor: bg, borderColor: color + "30" }]}>
      <Text style={[styles.statChipValue, { color }]}>{count}</Text>
      <Text style={styles.statChipLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  list: { padding: spacing.xl, paddingBottom: spacing.xxxl },
  loadingScreen: { flex: 1, alignItems: "center", justifyContent: "center", gap: spacing.md },
  loadingText: { fontSize: font.size.sm, color: colors.inkLight },

  listHeader: { gap: spacing.lg, marginBottom: spacing.md },
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
  },
  pageIconText: { fontSize: 26 },
  pageTitle: { fontSize: font.size.xl, fontWeight: font.weight.extrabold, color: colors.ink },
  pageSub: { fontSize: font.size.sm, color: colors.inkLight },

  statRow: { flexDirection: "row", gap: spacing.sm },
  statChip: {
    flex: 1,
    alignItems: "center",
    paddingVertical: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    gap: 2,
  },
  statChipValue: { fontSize: font.size.xl, fontWeight: font.weight.extrabold },
  statChipLabel: { fontSize: font.size.xs, color: colors.inkLight, fontWeight: font.weight.medium },

  filterRow: {
    flexDirection: "row",
    backgroundColor: colors.bgCard,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 4,
    gap: 4,
  },
  filterTab: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: radius.md,
    alignItems: "center",
  },
  filterTabActive: { backgroundColor: colors.brand },
  filterTabText: { fontSize: font.size.sm, fontWeight: font.weight.semibold, color: colors.inkLight },
  filterTabTextActive: { color: colors.white },

  taskCard: {
    flexDirection: "row",
    backgroundColor: colors.bgCard,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: "hidden",
    ...shadow.sm,
  },
  priorityBar: { width: 4 },
  taskInner: { flex: 1, padding: spacing.lg, gap: spacing.sm },
  taskTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: spacing.sm },
  taskTitle: { flex: 1, fontSize: font.size.md, fontWeight: font.weight.semibold, color: colors.ink },
  taskDesc: { fontSize: font.size.sm, color: colors.inkMid, lineHeight: 19 },
  taskMeta: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs, alignItems: "center" },

  badge: { paddingHorizontal: spacing.sm, paddingVertical: 3, borderRadius: radius.full },
  badgeText: { fontSize: font.size.xs, fontWeight: font.weight.bold },
  metaChip: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.bg,
    borderRadius: radius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: colors.border,
  },
  metaChipText: { fontSize: font.size.xs, color: colors.inkMid, fontWeight: font.weight.medium },
  pastDueChip: { backgroundColor: "#fef2f2", borderColor: "#fca5a5" },
  pastDueText: { color: "#dc2626" },

  empty: { alignItems: "center", paddingTop: 60, gap: spacing.md },
  emptyIconWrap: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.brandLight,
    alignItems: "center",
    justifyContent: "center",
    ...shadow.sm,
  },
  emptyIconText: { fontSize: 36 },
  emptyTitle: { fontSize: font.size.lg, fontWeight: font.weight.bold, color: colors.ink },
  emptyDesc: { fontSize: font.size.sm, color: colors.inkLight },
});
