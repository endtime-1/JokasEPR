import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { SyncBanner } from "../../components/SyncBanner";
import { fetchTodayAttendance, AttendanceEntry } from "../../api/endpoints";
import { colors, font, radius, shadow, spacing } from "../../constants/theme";

type StatusFilter = "all" | "PRESENT" | "LATE" | "ABSENT" | "ON_LEAVE";

const STATUS_CFG: Record<string, { label: string; color: string; bg: string; border: string; emoji: string }> = {
  PRESENT:  { label: "Present",  color: "#15803d", bg: "#f0fdf4", border: "#bbf7d0", emoji: "✅" },
  LATE:     { label: "Late",     color: "#d97706", bg: "#fff7ed", border: "#fed7aa", emoji: "⏰" },
  ABSENT:   { label: "Absent",   color: "#b91c1c", bg: "#fef2f2", border: "#fca5a5", emoji: "❌" },
  ON_LEAVE: { label: "On Leave", color: "#7c3aed", bg: "#faf5ff", border: "#c4b5fd", emoji: "🏖️" },
  HALF_DAY: { label: "Half Day", color: "#d97706", bg: "#fff7ed", border: "#fde68a", emoji: "🕐" },
};

function AttRow({ item }: { item: AttendanceEntry }) {
  const sc = STATUS_CFG[item.status] ?? STATUS_CFG.PRESENT;
  const fmt = (t?: string) => t
    ? new Date(t).toLocaleTimeString("en-GH", { hour: "2-digit", minute: "2-digit" })
    : "—";

  return (
    <View style={[styles.row, { backgroundColor: sc.bg, borderColor: sc.border }]}>
      <View style={[styles.emojiWrap, { borderColor: sc.border }]}>
        <Text style={styles.emoji}>{sc.emoji}</Text>
      </View>
      <View style={styles.rowContent}>
        <Text style={styles.empName}>{item.employee.fullName}</Text>
        <Text style={styles.empCode}>#{item.employee.code}{item.shift ? ` · ${item.shift.name}` : ""}</Text>
      </View>
      <View style={styles.rowRight}>
        {item.checkIn ? (
          <>
            <Text style={[styles.timeText, { color: sc.color }]}>{fmt(item.checkIn)}</Text>
            {item.checkOut && <Text style={styles.timeOut}>{fmt(item.checkOut)}</Text>}
          </>
        ) : (
          <Text style={[styles.statusLabel, { color: sc.color }]}>{sc.label}</Text>
        )}
      </View>
    </View>
  );
}

export function ShiftViewScreen() {
  const [records,  setRecords]  = useState<AttendanceEntry[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState("");
  const [filter,   setFilter]   = useState<StatusFilter>("all");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetchTodayAttendance();
      setRecords((res.data as AttendanceEntry[]) ?? []);
    } catch {
      setError("Could not load attendance. Pull down to retry.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const countBy = (s: string) => records.filter((r) => r.status === s).length;
  const presentCount  = countBy("PRESENT") + countBy("HALF_DAY");
  const lateCount     = countBy("LATE");
  const absentCount   = countBy("ABSENT");
  const leaveCount    = countBy("ON_LEAVE");

  const filtered = filter === "all"
    ? records
    : records.filter((r) => r.status === filter);

  const today = new Date().toLocaleDateString("en-GH", { weekday: "long", day: "numeric", month: "long" });

  return (
    <SafeAreaView style={styles.safe} edges={["bottom"]}>
      <SyncBanner />

      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={styles.iconWrap}><Text style={styles.iconText}>🗓️</Text></View>
          <View>
            <Text style={styles.title}>Today's Attendance</Text>
            <Text style={styles.sub}>{today}</Text>
          </View>
        </View>
      </View>

      {/* Summary chips */}
      <View style={styles.chipRow}>
        {[
          { label: "Present",  count: presentCount,  filter: "PRESENT"  as StatusFilter, color: "#15803d", bg: "#f0fdf4", border: "#bbf7d0" },
          { label: "Late",     count: lateCount,     filter: "LATE"     as StatusFilter, color: "#d97706", bg: "#fff7ed", border: "#fed7aa" },
          { label: "Absent",   count: absentCount,   filter: "ABSENT"   as StatusFilter, color: "#b91c1c", bg: "#fef2f2", border: "#fca5a5" },
          { label: "Leave",    count: leaveCount,    filter: "ON_LEAVE" as StatusFilter, color: "#7c3aed", bg: "#faf5ff", border: "#c4b5fd" },
        ].map((c) => (
          <TouchableOpacity key={c.label}
            style={[styles.chip, { backgroundColor: c.bg, borderColor: c.border },
              filter === c.filter && styles.chipSelected]}
            onPress={() => setFilter(filter === c.filter ? "all" : c.filter)}
          >
            <Text style={[styles.chipNum, { color: c.color }]}>{c.count}</Text>
            <Text style={[styles.chipLabel, { color: c.color }]}>{c.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* All / filtered toggle */}
      {filter !== "all" && (
        <TouchableOpacity style={styles.clearFilter} onPress={() => setFilter("all")}>
          <Text style={styles.clearFilterText}>× Clear filter · showing {STATUS_CFG[filter]?.label}</Text>
        </TouchableOpacity>
      )}

      {loading && !records.length ? (
        <View style={styles.center}><ActivityIndicator size="large" color={colors.brand} /></View>
      ) : error ? (
        <View style={styles.center}><Text style={styles.errorText}>{error}</Text></View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(i) => i.id}
          renderItem={({ item }) => <AttRow item={item} />}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={colors.brand} />}
          contentContainerStyle={styles.list}
          ItemSeparatorComponent={() => <View style={styles.sep} />}
          ListEmptyComponent={
            <View style={styles.center}>
              <Text style={styles.emptyText}>
                {filter !== "all"
                  ? `No ${STATUS_CFG[filter]?.label.toLowerCase()} records`
                  : "No attendance records today"}
              </Text>
              <Text style={styles.emptyHint}>
                {filter === "all" ? "Records appear once staff check in" : "Tap a chip to change filter"}
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
  headerLeft: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  iconWrap:   { width: 42, height: 42, borderRadius: radius.md, backgroundColor: "#eff6ff", borderWidth: 1, borderColor: "#bfdbfe", alignItems: "center", justifyContent: "center" },
  iconText:   { fontSize: 20 },
  title:      { fontSize: font.size.lg, fontWeight: font.weight.bold, color: colors.ink },
  sub:        { fontSize: font.size.xs, color: colors.inkLight },

  chipRow: { flexDirection: "row", gap: spacing.sm, padding: spacing.md, paddingBottom: 0 },
  chip: {
    flex: 1, alignItems: "center", paddingVertical: spacing.sm,
    borderRadius: radius.lg, borderWidth: 1, gap: 1,
  },
  chipSelected: { borderWidth: 2.5 },
  chipNum:   { fontSize: font.size.xl, fontWeight: font.weight.extrabold },
  chipLabel: { fontSize: 9, fontWeight: font.weight.bold, textTransform: "uppercase", letterSpacing: 0.3 },

  clearFilter: {
    marginHorizontal: spacing.lg, marginTop: spacing.sm,
    backgroundColor: colors.bgCard, borderRadius: radius.lg, borderWidth: 1,
    borderColor: colors.border, paddingVertical: spacing.sm, alignItems: "center",
  },
  clearFilterText: { fontSize: font.size.xs, color: colors.inkMid },

  row: {
    flexDirection: "row", alignItems: "center", gap: spacing.md,
    borderRadius: radius.xl, borderWidth: 1, padding: spacing.md, ...shadow.sm,
  },
  emojiWrap:   { width: 40, height: 40, borderRadius: 20, borderWidth: 1, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.6)" },
  emoji:       { fontSize: 20 },
  rowContent:  { flex: 1, gap: 3 },
  empName:     { fontSize: font.size.sm, fontWeight: font.weight.semibold, color: colors.ink },
  empCode:     { fontSize: font.size.xs, color: colors.inkLight },
  rowRight:    { alignItems: "flex-end", gap: 2 },
  timeText:    { fontSize: font.size.sm, fontWeight: font.weight.bold },
  timeOut:     { fontSize: font.size.xs, color: colors.inkLight },
  statusLabel: { fontSize: font.size.xs, fontWeight: font.weight.bold, textTransform: "uppercase" },

  sep:       { height: spacing.sm },
  center:    { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.xxl, gap: spacing.sm },
  errorText: { fontSize: font.size.sm, color: colors.error, textAlign: "center" },
  emptyText: { fontSize: font.size.md, fontWeight: font.weight.bold, color: colors.ink },
  emptyHint: { fontSize: font.size.sm, color: colors.inkLight, textAlign: "center" },
});
