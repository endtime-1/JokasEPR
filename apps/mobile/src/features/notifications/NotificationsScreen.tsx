import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { fetchNotifications, markAllNotificationsRead, markNotificationRead, type Notification } from "../../api/endpoints";
import { Card } from "../../components/Card";
import { Button } from "../../components/Button";
import { colors, font, spacing } from "../../constants/theme";

const TYPE_ICONS: Record<string, string> = {
  LOW_STOCK_ALERT: "📦", EXPIRY_ALERT: "⚠️", VACCINATION_REMINDER: "💉",
  MEDICATION_REMINDER: "💊", PRODUCTION_ORDER_COMPLETED: "✅", PURCHASE_APPROVAL_NEEDED: "🛒",
  CUSTOMER_PAYMENT_OVERDUE: "💰", SUPPLIER_PAYMENT_DUE: "📋", MACHINE_MAINTENANCE_DUE: "🔧",
  AI_RISK_ALERT: "🤖", TASK_ASSIGNED: "📌", QUALITY_BATCH_REJECTED: "❌", STOCK_TRANSFER_REQUEST: "🔄"
};

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

  function renderItem({ item }: { item: Notification }) {
    return (
      <TouchableOpacity
        onPress={() => { if (item.status === "UNREAD") markRead(item.id); }}
        activeOpacity={item.status === "UNREAD" ? 0.8 : 1}
      >
        <Card style={[styles.card, item.status === "UNREAD" && styles.cardUnread]} padded={false}>
          <View style={styles.cardInner}>
            <Text style={styles.icon}>{TYPE_ICONS[item.type] ?? "🔔"}</Text>
            <View style={styles.content}>
              <Text style={[styles.cardTitle, item.status === "UNREAD" && styles.cardTitleUnread]}>{item.title}</Text>
              <Text style={styles.cardBody} numberOfLines={2}>{item.body}</Text>
              <Text style={styles.cardTime}>{timeAgo(item.createdAt)}</Text>
            </View>
            {item.status === "UNREAD" && <View style={styles.dot} />}
          </View>
        </Card>
      </TouchableOpacity>
    );
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
        <View style={styles.center}><ActivityIndicator size="large" color={colors.brand} /></View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <View style={styles.header}>
        <Text style={styles.heading}>Notifications</Text>
        {unreadCount > 0 && (
          <Button label={`Mark all read (${unreadCount})`} variant="ghost" size="sm" loading={markingAll} onPress={markAll} />
        )}
      </View>

      <FlatList
        data={items}
        renderItem={renderItem}
        keyExtractor={(n) => n.id}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={colors.brand} />}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyIcon}>🔔</Text>
            <Text style={styles.emptyTitle}>No notifications</Text>
            <Text style={styles.emptyDesc}>You&apos;re all caught up!</Text>
          </View>
        }
        ItemSeparatorComponent={() => <View style={{ height: spacing.sm }} />}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.bgCard
  },
  heading: { fontSize: font.size.xl, fontWeight: font.weight.bold, color: colors.ink },
  list: { padding: spacing.xl, paddingBottom: spacing.xxxl },
  card: { overflow: "hidden" },
  cardUnread: { borderColor: colors.brand + "60", backgroundColor: colors.brandLight + "50" },
  cardInner: { flexDirection: "row", alignItems: "flex-start", padding: spacing.lg, gap: spacing.md },
  icon: { fontSize: 24, marginTop: 2 },
  content: { flex: 1, gap: 3 },
  cardTitle: { fontSize: font.size.md, fontWeight: font.weight.medium, color: colors.inkMid },
  cardTitleUnread: { fontWeight: font.weight.bold, color: colors.ink },
  cardBody: { fontSize: font.size.sm, color: colors.inkMid },
  cardTime: { fontSize: font.size.xs, color: colors.inkLight, marginTop: 2 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.brand, marginTop: 4 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  empty: { alignItems: "center", paddingTop: 80, gap: spacing.sm },
  emptyIcon: { fontSize: 48 },
  emptyTitle: { fontSize: font.size.lg, fontWeight: font.weight.bold, color: colors.ink },
  emptyDesc: { fontSize: font.size.sm, color: colors.inkMid }
});
