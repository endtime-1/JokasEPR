import { useCallback, useState } from "react";
import {
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { useFocusEffect } from "@react-navigation/native";
import { SyncBanner } from "../../components/SyncBanner";
import { Badge } from "../../components/Badge";
import { EmptyState } from "../../components/EmptyState";
import { Icon } from "../../components/Icon";
import { PageHeader } from "../../components/PageHeader";
import { SegmentedControl } from "../../components/SegmentedControl";
import { SkeletonList } from "../../components/SkeletonLoader";
import { StatRow } from "../../components/StatRow";
import { fetchMyTasks, fetchAllTasks, type Task } from "../../api/endpoints";
import { useAuth } from "../../auth/AuthContext";
import { colors, font, radius, semantic, shadow, spacing } from "../../constants/theme";

const PRIORITY_META: Record<string, { label: string; color: string; bg: string; border: string }> = {
  URGENT: { label: "Urgent",  ...semantic.priority.critical },
  HIGH:   { label: "High",    ...semantic.priority.high     },
  MEDIUM: { label: "Medium",  ...semantic.priority.medium   },
  LOW:    { label: "Low",     ...semantic.priority.low      },
};

const STATUS_META: Record<string, { label: string; color: string; bg: string; border: string }> = {
  COMPLETED:   { label: "Completed",   ...semantic.status.approved   },
  IN_PROGRESS: { label: "In Progress", ...semantic.status.inProgress },
  OPEN:        { label: "Open",        ...semantic.status.pending    },
  ON_HOLD:     { label: "On Hold",     ...semantic.status.rejected   },
  CANCELLED:   { label: "Cancelled",   ...semantic.status.closed     },
};

const MANAGER_ROLES = ["SUPER_ADMIN", "CEO", "MANAGER", "HR_MANAGER", "ADMIN"];

function isPastDue(dueDate?: string) {
  if (!dueDate) return false;
  return new Date(dueDate) < new Date();
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

export function TaskListScreen() {
  const navigation = useNavigation<any>();
  const { user }   = useAuth();

  const isManager = user?.roles?.some((r) => MANAGER_ROLES.includes(r)) ?? false;

  const [tasks, setTasks]           = useState<Task[]>([]);
  const [loading, setLoading]       = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeFilter, setActiveFilter] = useState("all");
  const [viewMode, setViewMode]     = useState<"mine" | "all">("mine");

  const load = useCallback(async (isRefresh = false) => {
    if (!isRefresh) setLoading(true);
    else setRefreshing(true);
    try {
      const res = viewMode === "all" && isManager
        ? await fetchAllTasks({ limit: 100 })
        : await fetchMyTasks();
      setTasks((res.data as any) ?? []);
    } catch {
      //
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [viewMode, isManager]);

  // Refresh every time this screen gains focus
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const pending = tasks.filter((t) => t.status !== "COMPLETED" && t.status !== "CANCELLED");
  const done    = tasks.filter((t) => t.status === "COMPLETED" || t.status === "CANCELLED");

  const filtered =
    activeFilter === "pending" ? pending :
    activeFilter === "done"    ? done    :
    tasks;

  if (loading) {
    return (
      <SafeAreaView style={styles.safe} edges={["bottom"]}>
        <View style={styles.skeletonPad}>
          <SkeletonList count={5} />
        </View>
      </SafeAreaView>
    );
  }

  function renderTask({ item }: { item: Task }) {
    const pastDue = isPastDue(item.dueDate) && item.status !== "COMPLETED";
    const pMeta   = PRIORITY_META[item.priority] ?? PRIORITY_META.LOW;
    const sMeta   = STATUS_META[item.status]     ?? STATUS_META.OPEN;

    const assigneeName = item.assignees?.map((a) => a.fullName).join(", ")
      ?? item.assignedTo?.fullName;

    return (
      <TouchableOpacity
        onPress={() => navigation.navigate("TaskUpdate", { taskId: item.id, taskTitle: item.title })}
        activeOpacity={0.78}
      >
        <View style={styles.taskCard}>
          <View style={[styles.priorityBar, { backgroundColor: pMeta.color }]} />
          <View style={styles.taskInner}>
            <View style={styles.taskTop}>
              <Text style={styles.taskTitle} numberOfLines={2}>{item.title}</Text>
              <Badge label={sMeta.label} color={sMeta.color} bg={sMeta.bg} border={sMeta.border} />
            </View>
            {item.description ? (
              <Text style={styles.taskDesc} numberOfLines={2}>{item.description}</Text>
            ) : null}
            <View style={styles.taskMeta}>
              <Badge label={pMeta.label} color={pMeta.color} bg={pMeta.bg} border={pMeta.border} />
              {assigneeName ? (
                <View style={styles.metaChip}>
                  <Icon name="account" size={11} color={colors.inkMid} />
                  <Text style={styles.metaChipText} numberOfLines={1}>{assigneeName}</Text>
                </View>
              ) : null}
              {item.farm ? (
                <View style={styles.metaChip}>
                  <Icon name="map-marker" size={11} color={colors.inkMid} />
                  <Text style={styles.metaChipText}>{item.farm.name}</Text>
                </View>
              ) : null}
              {item.dueDate ? (
                <View style={[styles.metaChip, pastDue && styles.pastDueChip]}>
                  <Icon name={pastDue ? "alert" : "calendar"} size={11} color={pastDue ? "#dc2626" : colors.inkMid} />
                  <Text style={[styles.metaChipText, pastDue && styles.pastDueText]}>
                    {pastDue ? "OVERDUE · " : ""}{formatDate(item.dueDate)}
                  </Text>
                </View>
              ) : null}
            </View>

            {/* Quick-action buttons for managers */}
            {isManager && item.status === "OPEN" && (
              <TouchableOpacity
                style={styles.quickAction}
                onPress={() => navigation.navigate("TaskUpdate", { taskId: item.id, taskTitle: item.title })}
                activeOpacity={0.75}
              >
                <Icon name="pencil" size={13} color={colors.brand} />
                <Text style={styles.quickActionText}>Update Status</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </TouchableOpacity>
    );
  }

  const titleText    = viewMode === "all" ? "All Tasks" : "My Tasks";
  const subtitleText = viewMode === "all"
    ? `${tasks.length} task${tasks.length !== 1 ? "s" : ""} across all employees`
    : `${tasks.length} task${tasks.length !== 1 ? "s" : ""} assigned to you`;

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
            <PageHeader
              icon="checkbox-marked-circle"
              title={titleText}
              subtitle={subtitleText}
            />

            {/* Manager view toggle */}
            {isManager && (
              <View style={styles.viewToggle}>
                <TouchableOpacity
                  style={[styles.toggleBtn, viewMode === "mine" && styles.toggleBtnActive]}
                  onPress={() => { setViewMode("mine"); setActiveFilter("all"); }}
                >
                  <Icon name="account" size={14} color={viewMode === "mine" ? colors.brand : colors.inkMid} />
                  <Text style={[styles.toggleText, viewMode === "mine" && styles.toggleTextActive]}>My Tasks</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.toggleBtn, viewMode === "all" && styles.toggleBtnActive]}
                  onPress={() => { setViewMode("all"); setActiveFilter("all"); }}
                >
                  <Icon name="account-group" size={14} color={viewMode === "all" ? colors.brand : colors.inkMid} />
                  <Text style={[styles.toggleText, viewMode === "all" && styles.toggleTextActive]}>All Tasks</Text>
                </TouchableOpacity>
              </View>
            )}

            <StatRow
              items={[
                { label: "Pending", value: pending.length, color: "#d97706", bg: "#fffbeb" },
                { label: "Done",    value: done.length,    color: "#16a34a", bg: "#f0fdf4" },
                { label: "Total",   value: tasks.length,   color: colors.brand, bg: colors.brandLight },
              ]}
            />
            <SegmentedControl
              segments={[
                { key: "all",     label: "All",    badge: tasks.length   },
                { key: "pending", label: "Active", badge: pending.length },
                { key: "done",    label: "Done",   badge: done.length    },
              ]}
              active={activeFilter}
              onChange={setActiveFilter}
            />
          </View>
        }
        ListEmptyComponent={
          <EmptyState
            icon="checkbox-marked-circle-outline"
            title={
              activeFilter === "pending" ? "No active tasks" :
              activeFilter === "done"    ? "No completed tasks" :
              viewMode === "all" ? "No tasks yet" : "No tasks assigned"
            }
            subtitle={
              activeFilter === "all" && viewMode === "mine"
                ? "You're all caught up!"
                : "Try switching the filter above"
            }
          />
        }
      />

      {/* FAB — Assign Task (managers only) */}
      {isManager && (
        <TouchableOpacity
          style={styles.fab}
          onPress={() => navigation.navigate("TaskAssign")}
          activeOpacity={0.85}
        >
          <Icon name="plus" size={22} color="#fff" />
        </TouchableOpacity>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:        { flex: 1, backgroundColor: colors.bg },
  list:        { padding: spacing.xl, paddingBottom: 100 },
  skeletonPad: { padding: spacing.xl, gap: spacing.sm },

  listHeader: { gap: spacing.lg, marginBottom: spacing.md },

  viewToggle: {
    flexDirection: "row",
    backgroundColor: colors.bgCard,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: "hidden",
  },
  toggleBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
    paddingVertical: spacing.sm + 2,
  },
  toggleBtnActive: {
    backgroundColor: colors.brandLight,
    borderBottomWidth: 2,
    borderBottomColor: colors.brand,
  },
  toggleText: {
    fontSize: font.size.sm,
    fontFamily: font.family.medium,
    color: colors.inkMid,
  },
  toggleTextActive: {
    fontFamily: font.family.semibold,
    color: colors.brand,
  },

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
  taskInner:   { flex: 1, padding: spacing.lg, gap: spacing.sm },
  taskTop:     { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: spacing.sm },
  taskTitle:   { flex: 1, fontSize: font.size.md, fontFamily: font.family.semibold, color: colors.ink },
  taskDesc:    { fontSize: font.size.sm, color: colors.inkMid, lineHeight: 19, fontFamily: font.family.regular },
  taskMeta:    { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs, alignItems: "center" },

  metaChip: {
    flexDirection: "row", alignItems: "center", gap: 4,
    backgroundColor: colors.bg, borderRadius: radius.full,
    paddingHorizontal: spacing.sm, paddingVertical: 3,
    borderWidth: 1, borderColor: colors.border,
    maxWidth: 150,
  },
  metaChipText: { fontSize: font.size.xs, color: colors.inkMid, fontFamily: font.family.medium },
  pastDueChip:  { backgroundColor: "#fef2f2", borderColor: "#fca5a5" },
  pastDueText:  { color: "#dc2626" },

  quickAction: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    alignSelf: "flex-start",
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.full,
    backgroundColor: colors.brandLight,
    borderWidth: 1,
    borderColor: colors.brand,
    marginTop: 2,
  },
  quickActionText: {
    fontSize: font.size.xs,
    fontFamily: font.family.semibold,
    color: colors.brand,
  },

  fab: {
    position: "absolute",
    bottom: spacing.xl,
    right: spacing.xl,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.brand,
    alignItems: "center",
    justifyContent: "center",
    ...shadow.lg,
  },
});
