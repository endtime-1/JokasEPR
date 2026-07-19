import { useCallback, useEffect, useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { Badge } from "../../components/Badge";
import { Icon } from "../../components/Icon";
import { MetricCard } from "../../components/MetricCard";
import { PageHeader } from "../../components/PageHeader";
import { SkeletonMetricGrid } from "../../components/SkeletonLoader";
import { fetchHRDashboard, type HRDashboardData, type LeaveRequest } from "../../api/endpoints";
import { colors, font, radius, semantic, shadow, spacing } from "../../constants/theme";

const LEAVE_STATUS: Record<string, { color: string; bg: string; border: string; label: string }> = {
  PENDING:  { ...semantic.status.pending,  label: "Pending"  },
  APPROVED: { ...semantic.status.approved, label: "Approved" },
  REJECTED: { ...semantic.status.rejected, label: "Rejected" },
};

export function HRDashboardScreen() {
  const navigation = useNavigation<any>();
  const [data,       setData]       = useState<HRDashboardData["data"] | null>(null);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (isRefresh = false) => {
    if (!isRefresh) setLoading(true);
    else setRefreshing(true);
    try {
      const res = await fetchHRDashboard();
      setData(res.data);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return (
      <SafeAreaView style={styles.safe} edges={["bottom"]}>
        <ScrollView contentContainerStyle={styles.scroll}>
          <PageHeader icon="account-group" iconColor="#2563eb" title="HR Overview" />
          <SkeletonMetricGrid />
        </ScrollView>
      </SafeAreaView>
    );
  }

  const d = data;
  const attendancePct = Math.round(d?.attendanceRate ?? 0);
  const attendanceColor = attendancePct >= 90 ? "#16a34a" : attendancePct >= 70 ? "#d97706" : "#dc2626";

  return (
    <SafeAreaView style={styles.safe} edges={["bottom"]}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={colors.brand} />}
        showsVerticalScrollIndicator={false}
      >
        <PageHeader icon="account-group" iconColor="#2563eb" title="HR Overview" subtitle="People & attendance" />

        {/* KPI grid */}
        <View style={styles.grid}>
          <MetricCard icon="account-multiple"  value={String(d?.totalEmployees    ?? 0)}  label="Total Staff"    color="#2563eb" />
          <MetricCard icon="account-check"     value={String(d?.presentToday      ?? 0)}  label="Present Today"  color="#16a34a" />
          <MetricCard icon="account-off"       value={String(d?.absentToday       ?? 0)}  label="Absent Today"   color="#dc2626" />
          <MetricCard icon="calendar-question" value={String(d?.openLeaveRequests ?? 0)}  label="Pending Leave"  color="#d97706" />
        </View>

        {/* Attendance rate */}
        <View style={styles.attendanceCard}>
          <View style={styles.attendanceLeft}>
            <Text style={styles.attendanceLabel}>Today's Attendance Rate</Text>
            <Text style={[styles.attendancePct, { color: attendanceColor }]}>{attendancePct}%</Text>
          </View>
          <View style={styles.attendanceBarWrap}>
            <View style={styles.attendanceBg}>
              <View style={[styles.attendanceFill, { width: `${attendancePct}%` as any, backgroundColor: attendanceColor }]} />
            </View>
            <Text style={styles.attendanceSub}>{d?.presentToday} of {d?.totalEmployees} present</Text>
          </View>
        </View>

        {/* Quick actions */}
        <View style={styles.actionsRow}>
          <TouchableOpacity style={styles.actionBtn} onPress={() => navigation.navigate("EmployeeDirectory")} activeOpacity={0.8}>
            <Icon name="account-search-outline" size={20} color="#2563eb" />
            <Text style={[styles.actionText, { color: "#2563eb" }]}>Directory</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionBtn} onPress={() => navigation.navigate("ShiftView")} activeOpacity={0.8}>
            <Icon name="calendar-today" size={20} color="#7c3aed" />
            <Text style={[styles.actionText, { color: "#7c3aed" }]}>Attendance</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionBtn} onPress={() => navigation.navigate("LeaveStatus")} activeOpacity={0.8}>
            <Icon name="calendar-account" size={20} color="#d97706" />
            <Text style={[styles.actionText, { color: "#d97706" }]}>Leave</Text>
          </TouchableOpacity>
        </View>

        {/* Recent leave requests */}
        {d?.recentLeaveRequests?.length ? (
          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>Recent Leave Requests</Text>
            {d.recentLeaveRequests.slice(0, 5).map((lr: LeaveRequest, i) => {
              const s = LEAVE_STATUS[lr.status] ?? LEAVE_STATUS.PENDING;
              return (
                <View key={lr.id} style={[styles.leaveRow, i === 0 && styles.leaveRowFirst]}>
                  <View style={styles.leaveLeft}>
                    <Text style={styles.leaveType}>{lr.leaveType.replace(/_/g, " ")}</Text>
                    <Text style={styles.leaveDates}>
                      {new Date(lr.startDate).toLocaleDateString("en-GH", { day: "numeric", month: "short" })} –{" "}
                      {new Date(lr.endDate).toLocaleDateString("en-GH", { day: "numeric", month: "short" })} · {lr.daysRequested}d
                    </Text>
                  </View>
                  <Badge label={s.label} color={s.color} bg={s.bg} border={s.border} size="xs" />
                </View>
              );
            })}
          </View>
        ) : null}

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: colors.bg },
  scroll: { padding: spacing.xl, paddingBottom: spacing.xxxl, gap: spacing.md },

  grid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },

  attendanceCard:    { backgroundColor: colors.bgCard, borderRadius: radius.xl, borderWidth: 1, borderColor: colors.border, padding: spacing.lg, gap: spacing.md, ...shadow.sm, flexDirection: "row", alignItems: "center" },
  attendanceLeft:    { width: 80, gap: 2 },
  attendanceLabel:   { fontSize: font.size.xs, fontFamily: font.family.medium, color: colors.inkLight },
  attendancePct:     { fontSize: font.size.xxl, fontFamily: font.family.extrabold },
  attendanceBarWrap: { flex: 1, gap: spacing.xs },
  attendanceBg:      { height: 8, backgroundColor: colors.border, borderRadius: 4, overflow: "hidden" },
  attendanceFill:    { height: 8, borderRadius: 4 },
  attendanceSub:     { fontSize: font.size.xs, color: colors.inkLight, fontFamily: font.family.regular },

  actionsRow: { flexDirection: "row", gap: spacing.sm },
  actionBtn:  { flex: 1, flexDirection: "column", alignItems: "center", gap: 5, backgroundColor: colors.bgCard, borderRadius: radius.xl, borderWidth: 1, borderColor: colors.border, paddingVertical: spacing.md, ...shadow.sm },
  actionText: { fontSize: font.size.xs, fontFamily: font.family.bold },

  sectionCard:  { backgroundColor: colors.bgCard, borderRadius: radius.xl, borderWidth: 1, borderColor: colors.border, overflow: "hidden", ...shadow.sm },
  sectionTitle: { fontSize: font.size.sm, fontFamily: font.family.extrabold, color: colors.inkLight, textTransform: "uppercase", letterSpacing: 0.8, padding: spacing.lg, paddingBottom: spacing.sm },

  leaveRow:      { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: spacing.lg, borderTopWidth: 1, borderTopColor: colors.border, gap: spacing.md },
  leaveRowFirst: { borderTopWidth: 0 },
  leaveLeft:     { flex: 1, gap: 2 },
  leaveType:     { fontSize: font.size.sm, fontFamily: font.family.semibold, color: colors.ink, textTransform: "capitalize" },
  leaveDates:    { fontSize: font.size.xs, color: colors.inkLight, fontFamily: font.family.regular },
});
