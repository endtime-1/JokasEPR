import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { SyncBanner } from "../../components/SyncBanner";
import { fetchMaintenanceSchedules, MaintenanceScheduleItem } from "../../api/endpoints";
import { colors, font, radius, shadow, spacing } from "../../constants/theme";

const PRIORITY_COLOR: Record<string, string> = {
  LOW:      "#15803d",
  MEDIUM:   "#d97706",
  HIGH:     "#dc2626",
  CRITICAL: "#7c3aed",
};

const TYPE_EMOJI: Record<string, string> = {
  PREVENTIVE: "🛡️",
  CORRECTIVE: "🔧",
  INSPECTION: "🔍",
  CALIBRATION: "⚖️",
  REPAIR:     "🔩",
};

type UrgencyBand = "overdue" | "today" | "week" | "upcoming";

function getUrgency(nextDueDate: string): UrgencyBand {
  const now   = new Date();
  const due   = new Date(nextDueDate);
  const diffDays = Math.ceil((due.getTime() - now.getTime()) / 86_400_000);
  if (diffDays < 0)  return "overdue";
  if (diffDays === 0) return "today";
  if (diffDays <= 7)  return "week";
  return "upcoming";
}

const URGENCY_CONFIG: Record<UrgencyBand, { label: string; color: string; bg: string; border: string }> = {
  overdue:  { label: "OVERDUE",     color: "#b91c1c", bg: "#fef2f2", border: "#fca5a5" },
  today:    { label: "DUE TODAY",   color: "#d97706", bg: "#fff7ed", border: "#fed7aa" },
  week:     { label: "THIS WEEK",   color: "#d97706", bg: "#fff7ed", border: "#fde68a" },
  upcoming: { label: "UPCOMING",    color: "#15803d", bg: "#f0fdf4", border: "#bbf7d0" },
};

function ScheduleRow({ item, onLog }: { item: MaintenanceScheduleItem; onLog: () => void }) {
  const urgency = getUrgency(item.nextDueDate);
  const cfg     = URGENCY_CONFIG[urgency];
  const asset   = item.machine ?? item.equipment;
  const diffDays = Math.ceil((new Date(item.nextDueDate).getTime() - Date.now()) / 86_400_000);

  return (
    <View style={[styles.row, { borderColor: cfg.border, backgroundColor: cfg.bg }]}>
      <View style={styles.rowTop}>
        <View style={styles.rowLeft}>
          <Text style={styles.rowType}>{TYPE_EMOJI[item.maintenanceType] ?? "⚙️"} {item.maintenanceType.replace("_", " ")}</Text>
          <Text style={styles.rowTitle}>{item.title}</Text>
          {asset && <Text style={styles.rowAsset}>{asset.name} ({asset.code})</Text>}
        </View>
        <View style={styles.rowRight}>
          <View style={[styles.urgencyBadge, { backgroundColor: cfg.color }]}>
            <Text style={styles.urgencyText}>{cfg.label}</Text>
          </View>
          <Text style={[styles.dueText, { color: cfg.color }]}>
            {diffDays < 0
              ? `${Math.abs(diffDays)}d overdue`
              : diffDays === 0
              ? "Today"
              : `In ${diffDays}d`}
          </Text>
        </View>
      </View>

      <View style={styles.rowMeta}>
        <Text style={styles.metaItem}>
          🔁 Every {item.frequencyDays}d
        </Text>
        <Text style={[styles.metaItem, { color: PRIORITY_COLOR[item.priority] ?? colors.inkLight }]}>
          ● {item.priority} priority
        </Text>
        {item.lastCompletedAt && (
          <Text style={styles.metaItem}>
            ✅ Last: {new Date(item.lastCompletedAt).toLocaleDateString("en-GH", { day: "numeric", month: "short" })}
          </Text>
        )}
      </View>

      <TouchableOpacity style={styles.logBtn} onPress={onLog} activeOpacity={0.8}>
        <Text style={styles.logBtnText}>Log Work Done →</Text>
      </TouchableOpacity>
    </View>
  );
}

export function MaintenanceTasksScreen() {
  const navigation = useNavigation<any>();
  const [schedules, setSchedules] = useState<MaintenanceScheduleItem[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState("");
  const [filter,    setFilter]    = useState<"all" | "overdue" | "week">("all");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetchMaintenanceSchedules();
      const items = (res.data as MaintenanceScheduleItem[]) ?? [];
      // Sort: overdue first, then by nextDueDate ascending
      items.sort((a, b) => new Date(a.nextDueDate).getTime() - new Date(b.nextDueDate).getTime());
      setSchedules(items);
    } catch {
      setError("Could not load schedules. Pull down to retry.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = schedules.filter((s) => {
    if (filter === "all")    return true;
    if (filter === "overdue") return getUrgency(s.nextDueDate) === "overdue";
    if (filter === "week")    return ["overdue", "today", "week"].includes(getUrgency(s.nextDueDate));
    return true;
  });

  const overdueCount = schedules.filter((s) => getUrgency(s.nextDueDate) === "overdue").length;
  const thisWeekCount = schedules.filter((s) => ["today", "week"].includes(getUrgency(s.nextDueDate))).length;

  return (
    <SafeAreaView style={styles.safe} edges={["bottom"]}>
      <SyncBanner />

      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={styles.iconWrap}><Text style={styles.iconText}>📅</Text></View>
          <View>
            <Text style={styles.title}>Maintenance Schedule</Text>
            <Text style={styles.sub}>Upcoming & overdue tasks</Text>
          </View>
        </View>
        <TouchableOpacity style={styles.breakdownBtn} onPress={() => navigation.navigate("BreakdownReport")}>
          <Text style={styles.breakdownBtnText}>⚠️ Breakdown</Text>
        </TouchableOpacity>
      </View>

      {/* Summary chips */}
      <View style={styles.chipRow}>
        <View style={[styles.chip, { backgroundColor: "#fef2f2", borderColor: "#fca5a5" }]}>
          <Text style={[styles.chipNum, { color: "#b91c1c" }]}>{overdueCount}</Text>
          <Text style={[styles.chipLabel, { color: "#b91c1c" }]}>Overdue</Text>
        </View>
        <View style={[styles.chip, { backgroundColor: "#fff7ed", borderColor: "#fed7aa" }]}>
          <Text style={[styles.chipNum, { color: "#d97706" }]}>{thisWeekCount}</Text>
          <Text style={[styles.chipLabel, { color: "#d97706" }]}>This Week</Text>
        </View>
        <View style={[styles.chip, { backgroundColor: "#f0fdf4", borderColor: "#bbf7d0" }]}>
          <Text style={[styles.chipNum, { color: "#15803d" }]}>{schedules.length}</Text>
          <Text style={[styles.chipLabel, { color: "#15803d" }]}>Total</Text>
        </View>
      </View>

      {/* Filter tabs */}
      <View style={styles.filterRow}>
        {(["all", "overdue", "week"] as const).map((f) => (
          <TouchableOpacity key={f} style={[styles.filterBtn, filter === f && styles.filterBtnActive]} onPress={() => setFilter(f)}>
            <Text style={[styles.filterLabel, filter === f && styles.filterLabelActive]}>
              {f === "all" ? `All (${schedules.length})` : f === "overdue" ? `Overdue (${overdueCount})` : `This Week (${thisWeekCount})`}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading && !schedules.length ? (
        <View style={styles.center}><ActivityIndicator size="large" color={colors.brand} /></View>
      ) : error ? (
        <View style={styles.center}><Text style={styles.errorText}>{error}</Text></View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(i) => i.id}
          renderItem={({ item }) => (
            <ScheduleRow
              item={item}
              onLog={() => navigation.navigate("MaintenanceLog", {
                scheduleId:      item.id,
                machineId:       item.machine?.id,
                equipmentId:     item.equipment?.id,
                assetName:       (item.machine ?? item.equipment)?.name ?? "Asset",
                maintenanceType: item.maintenanceType,
              })}
            />
          )}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={colors.brand} />}
          contentContainerStyle={styles.list}
          ItemSeparatorComponent={() => <View style={styles.sep} />}
          ListEmptyComponent={
            <View style={styles.center}>
              <Text style={styles.emptyText}>No schedules found</Text>
              <Text style={styles.emptyHint}>
                {filter === "overdue" ? "No overdue maintenance tasks" : "No tasks match this filter"}
              </Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  list: { padding: spacing.lg, paddingBottom: spacing.xxxl },

  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    padding: spacing.lg, paddingBottom: spacing.sm,
    backgroundColor: colors.bgCard, borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  headerLeft:  { flexDirection: "row", alignItems: "center", gap: spacing.md },
  iconWrap:    { width: 42, height: 42, borderRadius: radius.md, backgroundColor: "#eff6ff", borderWidth: 1, borderColor: "#bfdbfe", alignItems: "center", justifyContent: "center" },
  iconText:    { fontSize: 20 },
  title:       { fontSize: font.size.lg, fontWeight: font.weight.bold, color: colors.ink },
  sub:         { fontSize: font.size.xs, color: colors.inkLight },
  breakdownBtn:     { backgroundColor: "#dc2626", paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.full },
  breakdownBtnText: { color: colors.white, fontWeight: font.weight.bold, fontSize: font.size.xs },

  chipRow: { flexDirection: "row", gap: spacing.sm, padding: spacing.md, paddingBottom: 0 },
  chip:    { flex: 1, alignItems: "center", paddingVertical: spacing.sm, borderRadius: radius.lg, borderWidth: 1, gap: 1 },
  chipNum: { fontSize: font.size.xl, fontWeight: font.weight.extrabold },
  chipLabel: { fontSize: 9, fontWeight: font.weight.bold, textTransform: "uppercase", letterSpacing: 0.3 },

  filterRow: { flexDirection: "row", margin: spacing.md, marginBottom: 0, backgroundColor: colors.bg, borderRadius: radius.xl, borderWidth: 1, borderColor: colors.border, overflow: "hidden" },
  filterBtn: { flex: 1, paddingVertical: spacing.md, alignItems: "center" },
  filterBtnActive: { backgroundColor: colors.brand },
  filterLabel:     { fontSize: font.size.xs, fontWeight: font.weight.semibold, color: colors.inkLight },
  filterLabelActive: { color: colors.white },

  row: { borderRadius: radius.xl, borderWidth: 1, padding: spacing.lg, gap: spacing.sm, ...shadow.sm },
  rowTop: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm },
  rowLeft:  { flex: 1, gap: 3 },
  rowRight: { alignItems: "flex-end", gap: 4 },

  rowType:  { fontSize: font.size.xs, fontWeight: font.weight.bold, color: colors.inkLight, textTransform: "uppercase", letterSpacing: 0.5 },
  rowTitle: { fontSize: font.size.md, fontWeight: font.weight.semibold, color: colors.ink },
  rowAsset: { fontSize: font.size.xs, color: colors.inkMid },

  urgencyBadge: { paddingHorizontal: spacing.sm, paddingVertical: 2, borderRadius: radius.full },
  urgencyText:  { fontSize: 9, fontWeight: font.weight.extrabold, color: colors.white, letterSpacing: 0.5 },
  dueText:      { fontSize: font.size.sm, fontWeight: font.weight.bold },

  rowMeta:  { flexDirection: "row", flexWrap: "wrap", gap: spacing.md },
  metaItem: { fontSize: font.size.xs, color: colors.inkLight },

  logBtn:     { backgroundColor: colors.brand, borderRadius: radius.lg, paddingVertical: spacing.md, alignItems: "center" },
  logBtnText: { color: colors.white, fontWeight: font.weight.bold, fontSize: font.size.sm },

  sep:       { height: spacing.md },
  center:    { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.xxl, gap: spacing.sm },
  errorText: { fontSize: font.size.sm, color: colors.error, textAlign: "center" },
  emptyText: { fontSize: font.size.lg, fontWeight: font.weight.bold, color: colors.ink },
  emptyHint: { fontSize: font.size.sm, color: colors.inkLight, textAlign: "center" },
});
