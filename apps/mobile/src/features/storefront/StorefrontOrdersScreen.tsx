import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, FlatList, Modal, RefreshControl, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Icon } from "../../components/Icon";
import { Badge } from "../../components/Badge";
import { EmptyState } from "../../components/EmptyState";
import { SegmentedControl } from "../../components/SegmentedControl";
import { useToast } from "../../components/Toast";
import { fetchStorefrontOrders, updateStorefrontOrderStatus, type StorefrontOrder } from "../../api/endpoints";
import { colors, font, radius, semantic, shadow, spacing } from "../../constants/theme";

const STATUS_CFG: Record<string, { label: string; color: string; bg: string; border: string; next?: string; nextLabel?: string }> = {
  PENDING_STOCK_APPROVAL: { label: "Pending",   ...semantic.status.pending,    next: "APPROVED",   nextLabel: "Confirm Order"  },
  APPROVED:               { label: "Confirmed",  ...semantic.status.inProgress, next: "FULFILLED",  nextLabel: "Mark Delivered" },
  FULFILLED:              { label: "Delivered",  ...semantic.status.approved                                                    },
  CANCELLED:              { label: "Cancelled",  ...semantic.status.rejected                                                    },
};

const TABS = ["ALL", "PENDING", "CONFIRMED", "DELIVERED", "CANCELLED"] as const;
type Tab = typeof TABS[number];

const TAB_STATUS: Record<Tab, string | null> = {
  ALL: null,
  PENDING: "PENDING_STOCK_APPROVAL",
  CONFIRMED: "APPROVED",
  DELIVERED: "FULFILLED",
  CANCELLED: "CANCELLED",
};

function fmt(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("en-GH", { day: "numeric", month: "short", year: "numeric" });
}

function GHS(n: number) {
  return `GHS ${n.toLocaleString("en-GH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function OrderCard({
  order,
  onUpdated,
}: {
  order: StorefrontOrder;
  onUpdated: (o: StorefrontOrder) => void;
}) {
  const toast             = useToast();
  const [expanded,   setExpanded]   = useState(false);
  const [actioning,  setActioning]  = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [showCancel, setShowCancel] = useState(false);

  const sc   = STATUS_CFG[order.status] ?? { label: order.statusLabel, ...semantic.status.draft };
  const next = sc.next && sc.nextLabel ? { status: sc.next, label: sc.nextLabel } : null;

  async function advance() {
    if (!next) return;
    setActioning(true);
    try {
      await updateStorefrontOrderStatus(order.id, next.status);
      const sc2 = STATUS_CFG[next.status];
      onUpdated({ ...order, status: next.status, statusLabel: sc2?.label ?? next.status });
      toast.show({ type: "success", message: `Order ${next.label.toLowerCase()}d.` });
    } catch {
      toast.show({ type: "error", message: "Failed to update order status." });
    } finally {
      setActioning(false);
    }
  }

  async function cancel() {
    setCancelling(true);
    setShowCancel(false);
    try {
      await updateStorefrontOrderStatus(order.id, "CANCELLED");
      onUpdated({ ...order, status: "CANCELLED", statusLabel: "Cancelled" });
      toast.show({ type: "success", message: "Order cancelled." });
    } catch {
      toast.show({ type: "error", message: "Failed to cancel order." });
    } finally {
      setCancelling(false);
    }
  }

  return (
    <>
      <TouchableOpacity
        style={[styles.card, expanded && styles.cardExpanded]}
        onPress={() => setExpanded((e) => !e)}
        activeOpacity={0.85}
      >
        {/* Header row */}
        <View style={styles.cardHeader}>
          <Badge label={sc.label} color={sc.color} bg={sc.bg} border={sc.border} />
          <View style={styles.cardMeta}>
            <Text style={styles.cardCustomer} numberOfLines={1}>
              {order.customer.name ?? "—"}
            </Text>
            <Text style={styles.cardRef}>
              {order.ref ?? order.orderNumber} · {fmt(order.orderDate)}
            </Text>
          </View>
          <Text style={styles.cardTotal}>{GHS(order.total)}</Text>
          <Icon name={expanded ? "chevron-up" : "chevron-down"} size={18} color={colors.inkLight} />
        </View>

        {/* Expanded detail */}
        {expanded && (
          <View style={styles.cardBody}>
            {/* Contact */}
            {(order.customer.phone || order.customer.email || order.customer.address) && (
              <View style={styles.contactBlock}>
                {order.customer.phone && (
                  <View style={styles.contactRow}>
                    <Icon name="phone" size={13} color={colors.brand} />
                    <Text style={styles.contactText}>{order.customer.phone}</Text>
                  </View>
                )}
                {order.customer.email && (
                  <View style={styles.contactRow}>
                    <Icon name="email-outline" size={13} color={colors.brand} />
                    <Text style={styles.contactText}>{order.customer.email}</Text>
                  </View>
                )}
                {order.customer.address && (
                  <View style={styles.contactRow}>
                    <Icon name="map-marker-outline" size={13} color={colors.brand} />
                    <Text style={styles.contactText}>{order.customer.address}</Text>
                  </View>
                )}
              </View>
            )}

            {/* Items */}
            <View style={styles.itemsBlock}>
              <Text style={styles.itemsLabel}>ORDER ITEMS</Text>
              {order.items.map((item, i) => (
                <View key={i} style={styles.itemRow}>
                  <Text style={styles.itemName}>{item.name}</Text>
                  <Text style={styles.itemQty}>{item.qty}×</Text>
                  <Text style={styles.itemPrice}>{GHS(item.total)}</Text>
                </View>
              ))}
              <View style={styles.itemTotalRow}>
                <Text style={styles.itemTotalLabel}>Total</Text>
                <Text style={styles.itemTotalValue}>{GHS(order.total)}</Text>
              </View>
            </View>

            {/* Customer note */}
            {order.notes && (
              <View style={styles.noteBlock}>
                <Icon name="note-text-outline" size={14} color="#d97706" />
                <Text style={styles.noteText}>{order.notes}</Text>
              </View>
            )}

            {/* Action buttons */}
            {order.status !== "FULFILLED" && order.status !== "CANCELLED" && (
              <View style={styles.actions}>
                {next && (
                  <TouchableOpacity
                    style={[styles.advanceBtn, actioning && { opacity: 0.6 }]}
                    onPress={advance}
                    disabled={actioning}
                    activeOpacity={0.8}
                  >
                    {actioning ? (
                      <ActivityIndicator size="small" color={colors.white} />
                    ) : (
                      <>
                        <Icon name="check-circle" size={16} color={colors.white} />
                        <Text style={styles.advanceBtnText}>{next.label}</Text>
                      </>
                    )}
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  style={[styles.cancelBtn, cancelling && { opacity: 0.6 }]}
                  onPress={() => setShowCancel(true)}
                  disabled={cancelling}
                  activeOpacity={0.8}
                >
                  <Icon name="close-circle-outline" size={16} color={colors.error} />
                  <Text style={styles.cancelBtnText}>Cancel</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        )}
      </TouchableOpacity>

      {/* Cancel confirmation modal */}
      <Modal visible={showCancel} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>Cancel Order?</Text>
            <Text style={styles.modalSub}>
              This will cancel the order for {order.customer.name ?? "this customer"}. This cannot be undone.
            </Text>
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalCancel} onPress={() => setShowCancel(false)}>
                <Text style={styles.modalCancelText}>Keep Order</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalConfirm} onPress={cancel}>
                <Text style={styles.modalConfirmText}>Yes, Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

export function StorefrontOrdersScreen() {
  const toast              = useToast();
  const searchRef          = useRef<TextInput>(null);
  const [orders,   setOrders]   = useState<StorefrontOrder[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [search,   setSearch]   = useState("");
  const [tab,      setTab]      = useState<Tab>("ALL");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const status = TAB_STATUS[tab] ?? undefined;
      const res    = await fetchStorefrontOrders(status, search || undefined);
      setOrders(res.data ?? []);
    } catch {
      toast.show({ type: "error", message: "Could not load orders." });
    } finally {
      setLoading(false);
    }
  }, [tab, search]);

  useEffect(() => { load(); }, [load]);

  function handleUpdated(updated: StorefrontOrder) {
    setOrders((prev) => prev.map((o) => (o.id === updated.id ? updated : o)));
  }

  const pendingCount = orders.filter((o) => o.status === "PENDING_STOCK_APPROVAL").length;

  return (
    <SafeAreaView style={styles.safe} edges={["bottom"]}>
      {/* Search bar */}
      <View style={styles.searchWrap}>
        <Icon name="magnify" size={18} color={colors.inkLight} />
        <TextInput
          ref={searchRef}
          style={styles.searchInput}
          placeholder="Search by name, phone, or ref…"
          placeholderTextColor={colors.inkLight}
          value={search}
          onChangeText={setSearch}
          returnKeyType="search"
          onSubmitEditing={load}
        />
        {search ? (
          <TouchableOpacity onPress={() => setSearch("")} hitSlop={8}>
            <Icon name="close" size={16} color={colors.inkLight} />
          </TouchableOpacity>
        ) : null}
      </View>

      {/* Tabs */}
      <View style={styles.tabsWrap}>
        <SegmentedControl
          options={TABS.map((t) => ({
            label: t === "ALL" ? `All (${orders.length})` :
                   t === "PENDING" && pendingCount > 0 ? `Pending (${pendingCount})` :
                   t.charAt(0) + t.slice(1).toLowerCase(),
            value: t,
          }))}
          selected={tab}
          onSelect={(v) => setTab(v as Tab)}
        />
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator size="large" color={colors.brand} /></View>
      ) : orders.length === 0 ? (
        <EmptyState
          icon="shopping-outline"
          title="No orders"
          message={tab === "ALL" ? "Storefront orders will appear here" : `No ${tab.toLowerCase()} orders`}
        />
      ) : (
        <FlatList
          data={orders}
          keyExtractor={(o) => o.id}
          renderItem={({ item }) => <OrderCard order={item} onUpdated={handleUpdated} />}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={colors.brand} />}
          contentContainerStyle={styles.list}
          ItemSeparatorComponent={() => <View style={{ height: spacing.sm }} />}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  list:   { padding: spacing.lg, paddingBottom: spacing.xxxl },

  searchWrap:  { flexDirection: "row", alignItems: "center", gap: spacing.sm, margin: spacing.lg, marginBottom: 0, backgroundColor: colors.bgCard, borderRadius: radius.xl, borderWidth: 1, borderColor: colors.border, paddingHorizontal: spacing.md, height: 44, ...shadow.sm },
  searchInput: { flex: 1, fontSize: font.size.sm, fontFamily: font.family.regular, color: colors.ink },

  tabsWrap: { paddingHorizontal: spacing.lg, paddingVertical: spacing.md },

  card:         { backgroundColor: colors.bgCard, borderRadius: radius.xl, borderWidth: 1, borderColor: colors.border, overflow: "hidden", ...shadow.sm },
  cardExpanded: { borderColor: colors.brandMid },
  cardHeader:   { flexDirection: "row", alignItems: "center", padding: spacing.md, gap: spacing.sm },
  cardMeta:     { flex: 1, gap: 2, minWidth: 0 },
  cardCustomer: { fontSize: font.size.sm, fontFamily: font.family.semibold, color: colors.ink },
  cardRef:      { fontSize: font.size.xs, color: colors.inkLight, fontFamily: font.family.regular },
  cardTotal:    { fontSize: font.size.sm, fontFamily: font.family.extrabold, color: colors.ink },

  cardBody:    { borderTopWidth: 1, borderTopColor: colors.border, padding: spacing.lg, gap: spacing.md },
  contactBlock:{ gap: spacing.xs },
  contactRow:  { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  contactText: { fontSize: font.size.xs, color: colors.inkMid, fontFamily: font.family.regular, flex: 1 },

  itemsBlock:      { gap: spacing.xs },
  itemsLabel:      { fontSize: 10, fontFamily: font.family.bold, color: colors.inkLight, textTransform: "uppercase", letterSpacing: 0.8 },
  itemRow:         { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  itemName:        { flex: 1, fontSize: font.size.xs, color: colors.ink, fontFamily: font.family.regular },
  itemQty:         { fontSize: font.size.xs, color: colors.inkLight, fontFamily: font.family.semibold },
  itemPrice:       { fontSize: font.size.xs, color: colors.ink, fontFamily: font.family.semibold },
  itemTotalRow:    { flexDirection: "row", justifyContent: "space-between", paddingTop: spacing.xs, borderTopWidth: 1, borderTopColor: colors.border },
  itemTotalLabel:  { fontSize: font.size.xs, fontFamily: font.family.bold, color: colors.inkMid },
  itemTotalValue:  { fontSize: font.size.sm, fontFamily: font.family.extrabold, color: colors.ink },

  noteBlock: { flexDirection: "row", alignItems: "flex-start", gap: spacing.xs, backgroundColor: "#fff7ed", borderRadius: radius.md, padding: spacing.sm },
  noteText:  { flex: 1, fontSize: font.size.xs, color: "#d97706", fontFamily: font.family.regular },

  actions:         { flexDirection: "row", gap: spacing.sm },
  advanceBtn:      { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.xs, backgroundColor: "#2563eb", borderRadius: radius.lg, paddingVertical: spacing.md },
  advanceBtnText:  { color: colors.white, fontSize: font.size.sm, fontFamily: font.family.bold },
  cancelBtn:       { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.xs, borderWidth: 1, borderColor: "#fca5a5", borderRadius: radius.lg, paddingVertical: spacing.md, paddingHorizontal: spacing.lg },
  cancelBtnText:   { color: colors.error, fontSize: font.size.sm, fontFamily: font.family.bold },

  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", alignItems: "center", justifyContent: "center", padding: spacing.xl },
  modalBox:     { backgroundColor: colors.bgCard, borderRadius: radius.xl, padding: spacing.xl, gap: spacing.md, width: "100%" },
  modalTitle:   { fontSize: font.size.lg - 1, fontFamily: font.family.extrabold, color: colors.ink },
  modalSub:     { fontSize: font.size.sm, color: colors.inkMid, fontFamily: font.family.regular },
  modalActions: { flexDirection: "row", gap: spacing.sm },
  modalCancel:  { flex: 1, alignItems: "center", paddingVertical: spacing.md, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border },
  modalCancelText:  { fontSize: font.size.sm, fontFamily: font.family.semibold, color: colors.inkMid },
  modalConfirm:     { flex: 1, alignItems: "center", paddingVertical: spacing.md, borderRadius: radius.lg, backgroundColor: colors.error },
  modalConfirmText: { fontSize: font.size.sm, fontFamily: font.family.bold, color: colors.white },
});
