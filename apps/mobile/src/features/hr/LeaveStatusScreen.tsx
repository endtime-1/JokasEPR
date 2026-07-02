import { useCallback, useEffect, useState } from "react";
import { FlatList, RefreshControl, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { Badge } from "../../components/Badge";
import { EmptyState } from "../../components/EmptyState";
import { Icon } from "../../components/Icon";
import { PageHeader } from "../../components/PageHeader";
import { SkeletonList } from "../../components/SkeletonLoader";
import { fetchMyLeaveRequests, type LeaveRequest } from "../../api/endpoints";
import { colors, font, radius, semantic, shadow, spacing } from "../../constants/theme";

const STATUS_META: Record<string, { color: string; bg: string; border: string; label: string }> = {
  PENDING:  { ...semantic.status.pending,    label: "Pending"  },
  APPROVED: { ...semantic.status.approved,   label: "Approved" },
  REJECTED: { ...semantic.status.rejected,   label: "Rejected" },
  CANCELLED:{ ...semantic.status.draft,      label: "Cancelled"},
};

const TYPE_COLOR: Record<string, string> = {
  ANNUAL:        "#2563eb",
  SICK:          "#dc2626",
  MATERNITY:     "#7c3aed",
  PATERNITY:     "#0891b2",
  COMPASSIONATE: "#d97706",
  UNPAID:        colors.inkMid,
};

const TYPE_ICON: Record<string, string> = {
  ANNUAL:        "umbrella-beach",
  SICK:          "medical-bag",
  MATERNITY:     "baby-carriage",
  PATERNITY:     "baby-face-outline",
  COMPASSIONATE: "heart-outline",
  UNPAID:        "cash-off",
};

export function LeaveStatusScreen() {
  const navigation = useNavigation<any>();
  const [requests,   setRequests]   = useState<LeaveRequest[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (isRefresh = false) => {
    if (!isRefresh) setLoading(true);
    else setRefreshing(true);
    try {
      const res = await fetchMyLeaveRequests();
      setRequests((res.data as any) ?? []);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return (
      <SafeAreaView style={styles.safe} edges={["bottom"]}>
        <View style={styles.pad}><SkeletonList count={4} /></View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={["bottom"]}>
      <FlatList
        data={requests}
        keyExtractor={(r) => r.id}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={colors.brand} />}
        ItemSeparatorComponent={() => <View style={{ height: spacing.sm }} />}
        ListHeaderComponent={
          <View style={styles.header}>
            <PageHeader
              icon="calendar-account"
              iconColor="#2563eb"
              title="My Leave Requests"
              subtitle={`${requests.length} request${requests.length !== 1 ? "s" : ""}`}
              right={
                <TouchableOpacity style={styles.newBtn} onPress={() => navigation.navigate("LeaveRequest")} activeOpacity={0.8}>
                  <Icon name="plus" size={18} color={colors.white} />
                </TouchableOpacity>
              }
            />
          </View>
        }
        ListEmptyComponent={
          <EmptyState icon="calendar-account" title="No leave requests" subtitle="You haven't submitted any leave requests yet." iconColor="#2563eb" actionLabel="Request Leave" onAction={() => navigation.navigate("LeaveRequest")} />
        }
        renderItem={({ item }) => {
          const s     = STATUS_META[item.status] ?? STATUS_META.PENDING;
          const color = TYPE_COLOR[item.leaveType] ?? colors.brand;
          const icon  = TYPE_ICON[item.leaveType] ?? "calendar";
          const typeLabel = item.leaveType.replace(/_/g, " ");
          return (
            <View style={styles.card}>
              <View style={styles.cardTop}>
                <View style={[styles.iconWrap, { backgroundColor: color + "15" }]}>
                  <Icon name={icon as any} size={20} color={color} />
                </View>
                <View style={styles.cardText}>
                  <Text style={styles.typeLabel}>{typeLabel}</Text>
                  <Text style={styles.dateRange}>
                    {new Date(item.startDate).toLocaleDateString("en-GH", { day: "numeric", month: "short" })} –{" "}
                    {new Date(item.endDate).toLocaleDateString("en-GH", { day: "numeric", month: "short", year: "numeric" })}
                  </Text>
                  <Text style={styles.days}>{item.daysRequested} day{item.daysRequested !== 1 ? "s" : ""}</Text>
                </View>
                <Badge label={s.label} color={s.color} bg={s.bg} border={s.border} />
              </View>
              {item.reason ? (
                <View style={styles.reasonRow}>
                  <Icon name="text-box-outline" size={13} color={colors.inkLight} />
                  <Text style={styles.reasonText} numberOfLines={2}>{item.reason}</Text>
                </View>
              ) : null}
              {item.reviewNote ? (
                <View style={[styles.reviewNote, item.status === "APPROVED" ? styles.reviewNoteGreen : styles.reviewNoteRed]}>
                  <Icon name={item.status === "APPROVED" ? "check-circle-outline" : "close-circle-outline"} size={13} color={item.status === "APPROVED" ? "#16a34a" : "#dc2626"} />
                  <Text style={[styles.reviewNoteText, { color: item.status === "APPROVED" ? "#16a34a" : "#dc2626" }]}>{item.reviewNote}</Text>
                </View>
              ) : null}
            </View>
          );
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: colors.bg },
  list:   { padding: spacing.xl, paddingBottom: spacing.xxxl },
  pad:    { padding: spacing.xl },
  header: { marginBottom: spacing.md },

  newBtn: { width: 36, height: 36, borderRadius: radius.full, backgroundColor: colors.brand, alignItems: "center", justifyContent: "center" },

  card:     { backgroundColor: colors.bgCard, borderRadius: radius.xl, borderWidth: 1, borderColor: colors.border, padding: spacing.lg, gap: spacing.sm, ...shadow.sm },
  cardTop:  { flexDirection: "row", alignItems: "flex-start", gap: spacing.md },
  iconWrap: { width: 48, height: 48, borderRadius: radius.md, alignItems: "center", justifyContent: "center" },
  cardText: { flex: 1, gap: 2 },
  typeLabel:{ fontSize: font.size.md, fontFamily: font.family.semibold, color: colors.ink, textTransform: "capitalize" },
  dateRange:{ fontSize: font.size.sm, color: colors.inkMid, fontFamily: font.family.regular },
  days:     { fontSize: font.size.xs, color: colors.inkLight, fontFamily: font.family.regular },

  reasonRow:  { flexDirection: "row", alignItems: "flex-start", gap: 6, paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border },
  reasonText: { flex: 1, fontSize: font.size.xs, color: colors.inkMid, fontFamily: font.family.regular, lineHeight: 16 },

  reviewNote:      { flexDirection: "row", alignItems: "flex-start", gap: 6, padding: spacing.sm, borderRadius: radius.lg },
  reviewNoteGreen: { backgroundColor: "#f0fdf4", borderWidth: 1, borderColor: "#bbf7d0" },
  reviewNoteRed:   { backgroundColor: "#fef2f2", borderWidth: 1, borderColor: "#fecaca" },
  reviewNoteText:  { flex: 1, fontSize: font.size.xs, fontFamily: font.family.semibold, lineHeight: 16 },
});
