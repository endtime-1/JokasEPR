import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useNavigation, useRoute } from "@react-navigation/native";
import { Icon } from "../../components/Icon";
import { useToast } from "../../components/Toast";
import { fetchCustomerDetail, type CustomerDetail, type SalesOrderListItem } from "../../api/endpoints";
import type { RecordsScreenProps } from "../../navigation/types";
import { colors, font, radius, semantic, shadow, spacing } from "../../constants/theme";

const GHS = (n: number) =>
  `GHS ${Number(n).toLocaleString("en-GH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const ORDER_STATUS: Record<string, { color: string; label: string }> = {
  DRAFT:    { color: semantic.status.draft.color,      label: "Draft"     },
  PENDING:  { color: semantic.status.pending.color,    label: "Pending"   },
  CONFIRMED:{ color: semantic.status.inProgress.color, label: "Confirmed" },
  INVOICED: { color: semantic.status.inProgress.color, label: "Invoiced"  },
  PAID:     { color: semantic.status.approved.color,   label: "Paid"      },
  CANCELLED:{ color: semantic.status.rejected.color,   label: "Cancelled" },
};

export function CustomerDetailScreen() {
  const navigation = useNavigation<any>();
  const route      = useRoute<RecordsScreenProps<"CustomerDetail">["route"]>();
  const toast      = useToast();
  const { customerId, customerName } = route.params;

  const [customer, setCustomer] = useState<CustomerDetail | null>(null);
  const [loading,  setLoading]  = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchCustomerDetail(customerId);
      setCustomer(res.data as any);
    } catch {
      toast.show({ type: "error", message: "Could not load customer." });
    } finally {
      setLoading(false);
    }
  }, [customerId]);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return (
      <SafeAreaView style={styles.safe} edges={["bottom"]}>
        <View style={styles.center}><ActivityIndicator size="large" color={colors.brand} /></View>
      </SafeAreaView>
    );
  }

  const c = customer;
  const initials = customerName.split(" ").map((n: string) => n[0]).join("").slice(0, 2).toUpperCase();

  return (
    <SafeAreaView style={styles.safe} edges={["bottom"]}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

        {/* Header */}
        <View style={styles.hero}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{initials}</Text>
          </View>
          <Text style={styles.heroName}>{c?.name ?? customerName}</Text>
          {c?.code && <Text style={styles.heroCode}>{c.code}</Text>}
          {c?.phone && (
            <View style={styles.heroContact}>
              <Icon name="phone-outline" size={13} color={colors.inkLight} />
              <Text style={styles.heroContactText}>{c.phone}</Text>
            </View>
          )}
          {c?.email && (
            <View style={styles.heroContact}>
              <Icon name="email-outline" size={13} color={colors.inkLight} />
              <Text style={styles.heroContactText}>{c.email}</Text>
            </View>
          )}
        </View>

        {/* KPI strip */}
        {c && (
          <View style={styles.statsRow}>
            <View style={styles.stat}>
              <Text style={styles.statVal}>{c.totalOrders}</Text>
              <Text style={styles.statLbl}>Orders</Text>
            </View>
            <View style={styles.statDiv} />
            <View style={styles.stat}>
              <Text style={styles.statVal}>{GHS(c.totalSpend)}</Text>
              <Text style={styles.statLbl}>Total Spend</Text>
            </View>
            <View style={styles.statDiv} />
            <View style={styles.stat}>
              <Text style={[styles.statVal, c.outstandingBalance > 0 && styles.statValRed]}>{GHS(c.outstandingBalance)}</Text>
              <Text style={styles.statLbl}>Outstanding</Text>
            </View>
          </View>
        )}

        {/* Quick action */}
        <TouchableOpacity style={styles.newOrderBtn} onPress={() => navigation.navigate("SalesOrder")} activeOpacity={0.8}>
          <Icon name="cart-plus" size={16} color={colors.brand} />
          <Text style={styles.newOrderText}>Create New Order</Text>
        </TouchableOpacity>

        {/* Recent orders */}
        {c?.recentOrders?.length ? (
          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>Recent Orders</Text>
            {c.recentOrders.map((o: SalesOrderListItem, i) => {
              const s = ORDER_STATUS[o.status] ?? ORDER_STATUS.DRAFT;
              return (
                <View key={o.id} style={[styles.orderRow, i === 0 && styles.orderRowFirst]}>
                  <View style={styles.orderLeft}>
                    <Text style={styles.orderNum}>{o.orderNumber}</Text>
                    <Text style={styles.orderDate}>{new Date(o.orderDate).toLocaleDateString("en-GH", { day: "numeric", month: "short", year: "numeric" })}</Text>
                  </View>
                  <View style={styles.orderRight}>
                    <View style={[styles.statusChip, { borderColor: s.color + "50", backgroundColor: s.color + "15" }]}>
                      <Text style={[styles.statusChipText, { color: s.color }]}>{s.label}</Text>
                    </View>
                    <Text style={styles.orderAmount}>{GHS(o.totalAmount)}</Text>
                  </View>
                </View>
              );
            })}
          </View>
        ) : (
          <View style={styles.emptyOrders}>
            <Icon name="receipt-text-outline" size={32} color={colors.inkLight} />
            <Text style={styles.emptyText}>No orders yet</Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: colors.bg },
  scroll: { padding: spacing.xl, paddingBottom: spacing.xxxl, gap: spacing.md },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },

  hero:           { alignItems: "center", gap: spacing.sm, paddingVertical: spacing.lg },
  avatar:         { width: 72, height: 72, borderRadius: 36, backgroundColor: colors.brand, alignItems: "center", justifyContent: "center", ...shadow.brand },
  avatarText:     { color: colors.white, fontSize: font.size.xl, fontFamily: font.family.extrabold },
  heroName:       { fontSize: font.size.xl, fontFamily: font.family.extrabold, color: colors.ink },
  heroCode:       { fontSize: font.size.xs, color: colors.inkLight, fontFamily: font.family.medium },
  heroContact:    { flexDirection: "row", alignItems: "center", gap: 5 },
  heroContactText:{ fontSize: font.size.sm, color: colors.inkMid, fontFamily: font.family.regular },

  statsRow:   { flexDirection: "row", backgroundColor: colors.bgCard, borderRadius: radius.xl, borderWidth: 1, borderColor: colors.border, padding: spacing.lg, ...shadow.sm },
  stat:       { flex: 1, alignItems: "center", gap: 2 },
  statVal:    { fontSize: font.size.md, fontFamily: font.family.extrabold, color: colors.ink },
  statValRed: { color: "#dc2626" },
  statLbl:    { fontSize: font.size.xs, color: colors.inkLight, fontFamily: font.family.medium },
  statDiv:    { width: 1, height: 30, backgroundColor: colors.border },

  newOrderBtn:  { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm, borderWidth: 1.5, borderColor: colors.brand, borderRadius: radius.xl, paddingVertical: spacing.md, backgroundColor: colors.brandLight },
  newOrderText: { fontSize: font.size.sm, fontFamily: font.family.bold, color: colors.brand },

  sectionCard:  { backgroundColor: colors.bgCard, borderRadius: radius.xl, borderWidth: 1, borderColor: colors.border, overflow: "hidden", ...shadow.sm },
  sectionTitle: { fontSize: font.size.sm, fontFamily: font.family.extrabold, color: colors.inkLight, textTransform: "uppercase", letterSpacing: 0.8, padding: spacing.lg, paddingBottom: spacing.sm },

  orderRow:      { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: spacing.lg, borderTopWidth: 1, borderTopColor: colors.border, gap: spacing.md },
  orderRowFirst: { borderTopWidth: 0 },
  orderLeft:     { flex: 1, gap: 2 },
  orderNum:      { fontSize: font.size.sm, fontFamily: font.family.semibold, color: colors.ink },
  orderDate:     { fontSize: font.size.xs, color: colors.inkLight, fontFamily: font.family.regular },
  orderRight:    { alignItems: "flex-end", gap: 4 },
  statusChip:    { paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.full, borderWidth: 1 },
  statusChipText:{ fontSize: 10, fontFamily: font.family.bold },
  orderAmount:   { fontSize: font.size.sm, fontFamily: font.family.extrabold, color: colors.ink },

  emptyOrders: { alignItems: "center", gap: spacing.sm, padding: spacing.xxl, backgroundColor: colors.bgCard, borderRadius: radius.xl, borderWidth: 1, borderColor: colors.border },
  emptyText:   { fontSize: font.size.sm, color: colors.inkLight, fontFamily: font.family.regular },
});
