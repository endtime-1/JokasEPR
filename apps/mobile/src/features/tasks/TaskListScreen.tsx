import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { SyncBanner } from "../../components/SyncBanner";
import { StatusBadge } from "../../components/StatusBadge";
import { Card } from "../../components/Card";
import { fetchMyTasks, type Task } from "../../api/endpoints";
import { colors, font, spacing, radius } from "../../constants/theme";

const PRIORITY_VARIANT: Record<string, "error" | "warning" | "info" | "default"> = {
  CRITICAL: "error",
  HIGH: "warning",
  MEDIUM: "info",
  LOW: "default"
};

const STATUS_VARIANT: Record<string, "success" | "warning" | "error" | "default"> = {
  COMPLETED: "success",
  IN_PROGRESS: "warning",
  PENDING: "default",
  BLOCKED: "error",
  CANCELLED: "error"
};

function timeAgo(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

function isPastDue(dueDate?: string) {
  if (!dueDate) return false;
  return new Date(dueDate) < new Date();
}

export function TaskListScreen() {
  const navigation = useNavigation<any>();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (isRefresh = false) => {
    if (!isRefresh) setLoading(true);
    else setRefreshing(true);
    try {
      const res = await fetchMyTasks();
      setTasks((res.data as any) ?? []);
    } catch {
      // ignore; show cached list
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const pending = tasks.filter((t) => t.status !== "COMPLETED" && t.status !== "CANCELLED");
  const done = tasks.filter((t) => t.status === "COMPLETED" || t.status === "CANCELLED");

  function renderTask({ item }: { item: Task }) {
    const pastDue = isPastDue(item.dueDate) && item.status !== "COMPLETED";
    return (
      <TouchableOpacity
        onPress={() => navigation.navigate("TaskUpdate", { taskId: item.id, taskTitle: item.title })}
        activeOpacity={0.8}
      >
        <Card style={styles.taskCard}>
          <View style={styles.taskHeader}>
            <Text style={styles.taskTitle} numberOfLines={2}>{item.title}</Text>
            <StatusBadge label={item.status.replace("_", " ")} variant={STATUS_VARIANT[item.status] ?? "default"} />
          </View>
          {item.description && (
            <Text style={styles.taskDesc} numberOfLines={2}>{item.description}</Text>
          )}
          <View style={styles.taskMeta}>
            <StatusBadge label={item.priority} variant={PRIORITY_VARIANT[item.priority] ?? "default"} />
            {item.farm && <Text style={styles.metaChip}>📍 {item.farm.name}</Text>}
            {item.dueDate && (
              <Text style={[styles.metaChip, pastDue && styles.pastDue]}>
                📅 {pastDue ? "OVERDUE · " : ""}{new Date(item.dueDate).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
              </Text>
            )}
          </View>
        </Card>
      </TouchableOpacity>
    );
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.safe} edges={["bottom"]}>
        <View style={styles.center}><ActivityIndicator size="large" color={colors.brand} /></View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={["bottom"]}>
      <SyncBanner />
      <FlatList
        data={[...pending, ...done]}
        renderItem={renderTask}
        keyExtractor={(t) => t.id}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={colors.brand} />}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyIcon}>✅</Text>
            <Text style={styles.emptyTitle}>No tasks assigned</Text>
            <Text style={styles.emptyDesc}>You&apos;re all caught up!</Text>
          </View>
        }
        ListHeaderComponent={
          tasks.length > 0 ? (
            <Text style={styles.summary}>
              {pending.length} pending · {done.length} completed
            </Text>
          ) : null
        }
        ItemSeparatorComponent={() => <View style={{ height: spacing.sm }} />}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  list: { padding: spacing.xl, gap: spacing.sm, paddingBottom: spacing.xxxl },
  summary: { fontSize: font.size.sm, color: colors.inkMid, marginBottom: spacing.sm },
  taskCard: { gap: spacing.sm },
  taskHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: spacing.sm },
  taskTitle: { flex: 1, fontSize: font.size.md, fontWeight: font.weight.semibold, color: colors.ink },
  taskDesc: { fontSize: font.size.sm, color: colors.inkMid },
  taskMeta: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs, alignItems: "center" },
  metaChip: { fontSize: font.size.xs, color: colors.inkMid },
  pastDue: { color: colors.error },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  empty: { alignItems: "center", justifyContent: "center", paddingTop: 80, gap: spacing.sm },
  emptyIcon: { fontSize: 48 },
  emptyTitle: { fontSize: font.size.lg, fontWeight: font.weight.bold, color: colors.ink },
  emptyDesc: { fontSize: font.size.sm, color: colors.inkMid }
});
