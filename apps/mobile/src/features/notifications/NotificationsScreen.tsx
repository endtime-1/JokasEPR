import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { fetchNotifications, markAllNotificationsRead, markNotificationRead, type Notification } from "../../api/endpoints";
import { colors, font, radius, shadow, spacing } from "../../constants/theme";

const TYPE_META: Record<string, { icon: string; color: string }> = {
  LOW_STOCK_ALERT:             { icon: "📦", color: "#f97316" },
  EXPIRY_ALERT:                { icon: "⚠️", color: "#dc2626" },
  VACCINATION_REMINDER:        { icon: "💉", color: "#0891b2" },
  MEDICATION_REMINDER:         { icon: "💊", color: "#7c3aed" },
  PRODUCTION_ORDER_COMPLETED:  { icon: "✅", color: "#16a34a" },
  PURCHASE_APPROVAL_NEEDED:    { icon: "🛒", color: "#d97706" },
  CUSTOMER_PAYMENT_OVERDUE:    { icon: "💰", color: "#dc2626" },
  SUPPLIER_PAYMENT_DUE:        { icon: "📋", color: "#d97706" },
  MACHINE_MAINTENANCE_DUE:     { icon: "🔧", color: "#64748b" },
  AI_RISK_ALERT:               { icon: "🤖", color: "#7c3aed" },
  TASK_ASSIGNED:               { icon: "📌", color: "#0891b2" },
  QUALITY_BATCH_REJECTED:      { icon: "❌", color: "#dc2626" },
  STOCK_TRANSFER_REQUEST:      { icon: "🔄", color: "#16a34a" },
};

function getMeta(type: string) {
  return TYPE_META[type] ?? { icon: "🔔", color: colors.brand };
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

export function NotificationsScreen() {
  const [items, setItems] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [markingAll, setMarkingAll] = useState(false);

  const load = useCallback(async (isRefresh = false) => {
    if (!isRefresh) setLoading(true);
    else setRefreshing(true);
    try {
      const res = await fetchNotifications("limit=30");
      setItems((res.data as any)?.data ?? []);
    } catch {
      //
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function markRead(id: string) {
    await markNotificationRead(id).catch(() => undefined);
    setItems((prev) => prev.map((n) => n.id === id ? { ...n, status: "READ" as const } : n));
  }

  async function markAll() {
    setMarkingAll(true);
    await markAllNotificationsRead().catch(() => undefined);
    setItems((prev) => prev.map((n) => ({ ...n, status: "READ" as const })));
    setMarkingAll(false);
  }

  const unreadCount = items.filter((n) => n.status === "UNREAD").length;

  if (loading) {
    return (
      <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
        <View style={styles.loadingScreen}>
          <ActivityIndicator size="large" color={colors.brand} />
          <Text style={styles.loadingText}>Loading notifications…</Text>
        </View>
      </SafeAreaView>
    );
  }

  function renderItem({ item }: { item: Notification }) {
    const meta = getMeta(item.type);
    const isUnread = item.status === "UNREAD";
    return (
      <TouchableOpacity
        onPress={() => { if (isUnread) markRead(item.id); }}
        activeOpacity={isUnread ? 0.75 : 1}
      >
        <View style={[styles.notifCard, isUnread && styles.notifCardUnread]}>
          {isUnread && <View style={[styles.accentBar, { backgroundColor: meta.color }]} />}
          <View style={[styles.iconWrap, { backgroundColor: meta.color + "18" }]}>
            <Text style={styles.notifIcon}>{meta.icon}</Text>
          </View>
          <View style={styles.notifBody}>
            <View style={styles.notifTitleRow}>
              <Text style={[styles.notifTitle, isUnread && styles.notifTitleBold]} numberOfLines={1}>
                {item.title}
              </Text>
              {isUnread && <View style={styles.unreadDot} />}
            </View>
            <Text style={styles.notifText} numberOfLines={2}>{item.body}</Text>
            <Text style={styles.notifTime}>{timeAgo(item.createdAt)}</Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>

      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.headerTitle}>Notifications</Text>
          {unreadCount > 0 && (
            <View style={styles.unreadBadge}>
              <Text style={styles.unreadBadgeText}>{unreadCount}</Text>
            </View>
          )}
        </View>
        {unreadCount > 0 && (
          <TouchableOpacity
            onPress={markAll}
            disabled={markingAll}
            style={styles.markAllBtn}
          >
            <Text style={styles.markAllText}>{markingAll ? "Marking…" : "Mark all read"}</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* List */}
      <FlatList
        data={items}
        renderItem={renderItem}
        keyExtractor={(n) => n.id}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={colors.brand} />}
        ItemSeparatorComponent={() => <View style={{ height: spacing.sm }} />}
        ListHeaderComponent={
          items.length > 0 ? (
            <View style={styles.listHeader}>
              <Text style={styles.listHeaderText}>
                {unreadCount > 0 ? `${unreadCount} unread` : "All caught up"} · {items.length} total
              </Text>
            </View>
          ) : null
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <View style={styles.emptyIconWrap}>
              <Text style={styles.emptyIconText}>🔔</Text>
            </View>
            <Text style={styles.emptyTitle}>No notifications</Text>
            <Text style={styles.emptyDesc}>You're all caught up! Check back later.</Text>
          </View>
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },

  loadingScreen: { flex: 1, alignItems: "center", justifyContent: "center", gap: spacing.md },
  loadingText: { fontSize: font.size.sm, color: colors.inkLight },

  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.lg,
    backgroundColor: colors.bgCard,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    ...shadow.sm,
  },
  headerLeft: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  headerTitle: { fontSize: font.size.xl, fontWeight: font.weight.extrabold, color: colors.ink },
  unreadBadge: {
    backgroundColor: colors.brand,
    borderRadius: radius.full,
    minWidth: 22,
    height: 22,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 6,
  },
  unreadBadgeText: { color: colors.white, fontSize: font.size.xs, fontWeight: font.weight.bold },
  markAllBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: 7,
    borderRadius: radius.full,
    backgroundColor: colors.brandLight,
    borderWidth: 1,
    borderColor: colors.brandMid,
  },
  markAllText: { fontSize: font.size.xs, color: colors.brand, fontWeight: font.weight.bold },

  list: { padding: spacing.xl, paddingBottom: spacing.xxxl },
  listHeader: { marginBottom: spacing.md },
  listHeaderText: { fontSize: font.size.xs, color: colors.inkLight, fontWeight: font.weight.medium },

  notifCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    backgroundColor: colors.bgCard,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.md,
    overflow: "hidden",
    ...shadow.sm,
  },
  notifCardUnread: {
    borderColor: colors.brand + "40",
    backgroundColor: "#fffdf9",
  },
  accentBar: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    width: 3,
    borderTopLeftRadius: radius.xl,
    borderBottomLeftRadius: radius.xl,
  },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  notifIcon: { fontSize: 22 },
  notifBody: { flex: 1, gap: 4 },
  notifTitleRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  notifTitle: { flex: 1, fontSize: font.size.sm, fontWeight: font.weight.medium, color: colors.inkMid },
  notifTitleBold: { fontWeight: font.weight.bold, color: colors.ink },
  unreadDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.brand },
  notifText: { fontSize: font.size.sm, color: colors.inkMid, lineHeight: 19 },
  notifTime: { fontSize: font.size.xs, color: colors.inkLight },

  empty: { alignItems: "center", paddingTop: 80, gap: spacing.md },
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
  emptyDesc: { fontSize: font.size.sm, color: colors.inkLight, textAlign: "center", paddingHorizontal: spacing.xl },
});
