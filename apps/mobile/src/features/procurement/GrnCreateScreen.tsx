import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, StyleSheet, Text, View } from "react-native";
import { useNavigation, useRoute } from "@react-navigation/native";
import { ScreenWrapper } from "../../components/ScreenWrapper";
import { FormField } from "../../components/FormField";
import { SelectField, SelectOption } from "../../components/SelectField";
import { Button } from "../../components/Button";
import { useLookup } from "../../hooks/useLookup";
import { fetchProcurementOptions, fetchPurchaseOrderDetail, PurchaseOrderDetail, submitGRN } from "../../api/endpoints";
import { apiFetch } from "../../api/client";
import { colors, font, radius, shadow, spacing } from "../../constants/theme";

type RouteParams = { poId: string; poRef: string; supplierName: string };
type LineState = { purchaseOrderItemId: string; productId?: string; productName: string; orderedQty: number; receivedQty: string; unitCost: number; uomCode: string; batchNumber: string };

function fmt(n: number) {
  return `GHS ${Number(n).toLocaleString("en-GH", { minimumFractionDigits: 2 })}`;
}

export function GrnCreateScreen() {
  const navigation = useNavigation<any>();
  const { poId, poRef, supplierName } = useRoute<any>().params as RouteParams;

  const [po,            setPo]            = useState<PurchaseOrderDetail | null>(null);
  const [poLoading,     setPoLoading]     = useState(true);
  const [poError,       setPoError]       = useState("");
  const [lines,         setLines]         = useState<LineState[]>([]);
  const [warehouseId,   setWarehouseId]   = useState("");
  const [receivedDate,  setReceivedDate]  = useState("");
  const [deliveryRef,   setDeliveryRef]   = useState("");
  const [notes,         setNotes]         = useState("");
  const [errors,        setErrors]        = useState<Record<string, string>>({});
  const [submitting,    setSubmitting]    = useState(false);

  useEffect(() => {
    fetchPurchaseOrderDetail(poId)
      .then((r) => {
        const detail = r.data as PurchaseOrderDetail;
        setPo(detail);
        setLines(
          detail.items.map((item) => ({
            purchaseOrderItemId: item.id,
            productId:   item.productId,
            productName: item.productName,
            orderedQty:  item.quantity,
            receivedQty: String(item.quantity - (item.receivedQty ?? 0)),
            unitCost:    item.unitCost,
            uomCode:     item.uomCode ?? "UNIT",
            batchNumber: "",
          }))
        );
      })
      .catch(() => setPoError("Failed to load PO details. Go back and try again."))
      .finally(() => setPoLoading(false));
  }, [poId]);

  const { data: opts } = useLookup("procurement_options", async () => {
    const r = await fetchProcurementOptions();
    return r.data;
  });
  const warehouses: SelectOption[] = useMemo(
    () => (opts?.warehouses ?? []).map((w) => ({ label: w.name, value: w.id })),
    [opts]
  );

  function updateLine(idx: number, key: "receivedQty" | "batchNumber", value: string) {
    setLines((prev) => prev.map((l, i) => i === idx ? { ...l, [key]: value } : l));
  }

  function validate() {
    const e: Record<string, string> = {};
    if (!warehouseId) e.warehouseId = "Select receiving warehouse";
    if (!receivedDate) e.receivedDate = "Enter received date (YYYY-MM-DD)";
    if (lines.some((l) => !l.receivedQty || Number(l.receivedQty) < 0))
      e.lines = "All items need a valid received quantity (0 or more)";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function handleSubmit() {
    if (!validate()) return;
    setSubmitting(true);
    try {
      await submitGRN({
        purchaseOrderId: poId,
        warehouseId,
        receivedDate: receivedDate || new Date().toISOString().slice(0, 10),
        deliveryNoteRef: deliveryRef || undefined,
        qualityCheckRequired: true,
        notes: notes || undefined,
        items: lines.map((l) => ({
          purchaseOrderItemId: l.purchaseOrderItemId,
          productId:           l.productId,
          productName:         l.productName,
          orderedQty:          l.orderedQty,
          receivedQty:         Number(l.receivedQty) || 0,
          rejectedQty:         0,
          unitCost:            l.unitCost,
          uomCode:             l.uomCode,
          batchNumber:         l.batchNumber || undefined,
          qualityStatus:       "PENDING",
        })),
      });
      Alert.alert(
        "GRN Created",
        `Goods Received Note for ${poRef} has been submitted. It will go through quality check before stock is posted.`,
        [{ text: "OK", onPress: () => { navigation.goBack(); navigation.goBack(); } }]
      );
    } catch (err: any) {
      Alert.alert("Error", err?.message ?? "Failed to create GRN. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (poLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.brand} />
        <Text style={styles.loadingText}>Loading PO details…</Text>
      </View>
    );
  }

  if (poError || !po) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>{poError || "PO not found"}</Text>
      </View>
    );
  }

  return (
    <ScreenWrapper>
      {/* Header */}
      <View style={styles.poCard}>
        <View style={styles.poCardRow}>
          <View style={styles.poIconWrap}><Text style={styles.poIconText}>📦</Text></View>
          <View style={styles.poCardText}>
            <Text style={styles.poRef}>{poRef}</Text>
            <Text style={styles.poSupplier}>{supplierName}</Text>
          </View>
          <Text style={styles.poTotal}>{fmt(po.totalAmount)}</Text>
        </View>
        <View style={styles.poMeta}>
          <Text style={styles.poMetaText}>{po.items.length} line items · {po.status.replace(/_/g, " ")}</Text>
          {po.expectedDelivery && (
            <Text style={styles.poMetaText}>
              Expected: {new Date(po.expectedDelivery).toLocaleDateString("en-GH", { day: "numeric", month: "short" })}
            </Text>
          )}
        </View>
      </View>

      <SelectField label="Receiving Warehouse" value={warehouseId} options={warehouses}
        onChange={(v) => { setWarehouseId(v); setErrors((e) => ({ ...e, warehouseId: "" })); }}
        error={errors.warehouseId} required placeholder="Select warehouse…" />

      <FormField label="Date Received" value={receivedDate}
        onChangeText={(v) => { setReceivedDate(v); setErrors((e) => ({ ...e, receivedDate: "" })); }}
        placeholder={`YYYY-MM-DD (default: today)`}
        error={errors.receivedDate} />

      <FormField label="Delivery Note / Waybill Ref" value={deliveryRef}
        onChangeText={setDeliveryRef} placeholder="Optional" />

      {/* Line items */}
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>ITEMS TO RECEIVE</Text>
        <View style={styles.sectionLine} />
        <View style={styles.itemCountBadge}>
          <Text style={styles.itemCountText}>{lines.length}</Text>
        </View>
      </View>

      {errors.lines && (
        <View style={styles.lineErrorBanner}>
          <Text style={styles.lineErrorText}>⚠ {errors.lines}</Text>
        </View>
      )}

      {lines.map((line, idx) => (
        <View key={line.purchaseOrderItemId} style={styles.lineCard}>
          <View style={styles.lineHeader}>
            <View style={styles.lineNum}><Text style={styles.lineNumText}>Item {idx + 1}</Text></View>
            <Text style={styles.lineProduct} numberOfLines={1}>{line.productName}</Text>
            <Text style={styles.lineUom}>{line.uomCode}</Text>
          </View>
          <View style={styles.lineRow}>
            <View style={styles.lineHalf}>
              <Text style={styles.lineMetaLabel}>Ordered</Text>
              <Text style={styles.lineMetaValue}>{line.orderedQty}</Text>
            </View>
            <View style={styles.lineHalf}>
              <FormField label="Received Qty" value={line.receivedQty}
                onChangeText={(v) => updateLine(idx, "receivedQty", v)}
                keyboardType="decimal-pad" />
            </View>
          </View>
          <FormField label="Batch / Lot Number" value={line.batchNumber}
            onChangeText={(v) => updateLine(idx, "batchNumber", v)}
            placeholder="Optional" />
        </View>
      ))}

      <FormField label="Notes" value={notes} onChangeText={setNotes}
        multiline numberOfLines={2}
        style={{ minHeight: 70, textAlignVertical: "top" } as any}
        placeholder="Condition of goods, any discrepancies…" />

      <View style={styles.qualityNotice}>
        <Text style={styles.qualityNoticeText}>
          ℹ GRN will be placed on Quality Hold. A quality officer must pass it before stock is posted to inventory.
        </Text>
      </View>

      <Button label="Submit GRN" loading={submitting} size="lg" onPress={handleSubmit} />
    </ScreenWrapper>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: spacing.md, padding: spacing.xxl },
  loadingText: { fontSize: font.size.sm, color: colors.inkLight },
  errorText:   { fontSize: font.size.sm, color: colors.error, textAlign: "center" },

  poCard: {
    backgroundColor: colors.bgCard,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.sm,
    ...shadow.sm,
  },
  poCardRow:   { flexDirection: "row", alignItems: "center", gap: spacing.md },
  poIconWrap:  { width: 44, height: 44, borderRadius: radius.md, backgroundColor: "#f0fdf4", borderWidth: 1, borderColor: "#bbf7d0", alignItems: "center", justifyContent: "center" },
  poIconText:  { fontSize: 22 },
  poCardText:  { flex: 1, gap: 2 },
  poRef:       { fontSize: font.size.md, fontWeight: font.weight.extrabold, color: colors.ink },
  poSupplier:  { fontSize: font.size.sm, color: colors.inkMid },
  poTotal:     { fontSize: font.size.lg, fontWeight: font.weight.extrabold, color: colors.brand },
  poMeta:      { flexDirection: "row", justifyContent: "space-between" },
  poMetaText:  { fontSize: font.size.xs, color: colors.inkLight },

  sectionHeader: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  sectionTitle:  { fontSize: font.size.xs, fontWeight: font.weight.bold, color: colors.inkLight, letterSpacing: 1 },
  sectionLine:   { flex: 1, height: 1, backgroundColor: colors.border },
  itemCountBadge: { minWidth: 22, height: 22, borderRadius: 11, backgroundColor: colors.brand + "20", alignItems: "center", justifyContent: "center", paddingHorizontal: 6 },
  itemCountText:  { fontSize: font.size.xs, fontWeight: font.weight.bold, color: colors.brand },

  lineErrorBanner: { backgroundColor: "#fef2f2", borderRadius: radius.md, padding: spacing.md, borderWidth: 1, borderColor: "#fca5a5" },
  lineErrorText:   { fontSize: font.size.sm, color: colors.error, fontWeight: font.weight.medium },

  lineCard: { backgroundColor: colors.bgCard, borderRadius: radius.xl, borderWidth: 1, borderColor: colors.border, padding: spacing.lg, gap: spacing.sm, ...shadow.sm },
  lineHeader: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  lineNum:    { backgroundColor: colors.brandLight, paddingHorizontal: spacing.sm, paddingVertical: 3, borderRadius: radius.full, borderWidth: 1, borderColor: colors.brandMid },
  lineNumText: { fontSize: font.size.xs, fontWeight: font.weight.bold, color: colors.brand },
  lineProduct: { flex: 1, fontSize: font.size.sm, fontWeight: font.weight.semibold, color: colors.ink },
  lineUom:    { fontSize: font.size.xs, color: colors.inkLight, backgroundColor: colors.bg, paddingHorizontal: spacing.sm, paddingVertical: 2, borderRadius: radius.full },

  lineRow:  { flexDirection: "row", gap: spacing.md, alignItems: "flex-end" },
  lineHalf: { flex: 1 },
  lineMetaLabel: { fontSize: font.size.xs, color: colors.inkLight, marginBottom: 4, textTransform: "uppercase", letterSpacing: 0.5 },
  lineMetaValue: { fontSize: font.size.xl, fontWeight: font.weight.extrabold, color: colors.inkMid },

  qualityNotice: { backgroundColor: "#eff6ff", borderRadius: radius.md, padding: spacing.md, borderWidth: 1, borderColor: "#bfdbfe" },
  qualityNoticeText: { fontSize: font.size.sm, color: "#1d4ed8" },
});
