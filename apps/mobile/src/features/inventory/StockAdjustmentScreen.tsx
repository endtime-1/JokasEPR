import { useMemo, useState } from "react";
import { Alert, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { ScreenWrapper } from "../../components/ScreenWrapper";
import { FormCard } from "../../components/FormCard";
import { FormFooter } from "../../components/FormFooter";
import { FormField } from "../../components/FormField";
import { SelectField, SelectOption } from "../../components/SelectField";
import { useSubmit } from "../../hooks/useSubmit";
import { useLookup } from "../../hooks/useLookup";
import { fetchInventoryOptions } from "../../api/endpoints";
import { colors, font, radius, spacing } from "../../constants/theme";

type AdjType = {
  value: string;
  label: string;
  defaultDir: "add" | "remove";
  desc: string;
};

const ADJ_TYPES: AdjType[] = [
  { value: "FOUND",             label: "Found / Surplus",        defaultDir: "add",    desc: "Stock found that wasn't recorded" },
  { value: "COUNT_CORRECTION",  label: "Count Correction",       defaultDir: "add",    desc: "Physical count differs from system" },
  { value: "DAMAGE",            label: "Damaged",                defaultDir: "remove", desc: "Stock damaged and unusable" },
  { value: "EXPIRY",            label: "Expired",                defaultDir: "remove", desc: "Stock past its expiry date" },
  { value: "WASTE",             label: "Waste / Spillage",       defaultDir: "remove", desc: "Stock lost through waste or spillage" },
  { value: "WRITE_OFF",         label: "Write-Off",              defaultDir: "remove", desc: "Stock written off (loss)" },
];

const ADJ_TYPE_OPTIONS: SelectOption[] = ADJ_TYPES.map((t) => ({ label: t.label, value: t.value }));

export function StockAdjustmentScreen() {
  const navigation = useNavigation<any>();

  const [warehouseId,    setWarehouseId]    = useState("");
  const [inventoryItemId, setInventoryItemId] = useState("");
  const [adjustmentType, setAdjustmentType] = useState("");
  const [direction,      setDirection]      = useState<"add" | "remove">("add");
  const [quantity,       setQuantity]       = useState("");
  const [reason,         setReason]         = useState("");
  const [errors,         setErrors]         = useState<Record<string, string>>({});

  const { data: opts } = useLookup("inventory_options", async () => {
    const r = await fetchInventoryOptions();
    return r.data;
  });

  const warehouses: SelectOption[] = useMemo(
    () => (opts?.warehouses ?? []).map((w) => ({ label: w.name, value: w.id })),
    [opts]
  );

  const warehouseItems = useMemo(
    () => (opts?.items ?? []).filter((i) => !warehouseId || i.warehouseId === warehouseId),
    [opts, warehouseId]
  );

  const itemOptions: SelectOption[] = useMemo(
    () => warehouseItems.map((i) => ({
      label: `${i.product.name} (${i.product.sku}) — ${Number(i.quantityOnHand)} on hand`,
      value: i.id,
    })),
    [warehouseItems]
  );

  const selectedItem = useMemo(
    () => warehouseItems.find((i) => i.id === inventoryItemId),
    [warehouseItems, inventoryItemId]
  );

  function onTypeChange(v: string) {
    setAdjustmentType(v);
    const found = ADJ_TYPES.find((t) => t.value === v);
    if (found) setDirection(found.defaultDir);
    setErrors((e) => ({ ...e, adjustmentType: "" }));
  }

  const qtyNum = Number(quantity) || 0;
  const signedQty = direction === "add" ? qtyNum : -qtyNum;

  function validate() {
    const e: Record<string, string> = {};
    if (!warehouseId)     e.warehouseId     = "Select a warehouse";
    if (!inventoryItemId) e.inventoryItemId = "Select a stock item";
    if (!adjustmentType)  e.adjustmentType  = "Select an adjustment type";
    if (!quantity || qtyNum <= 0) e.quantity = "Enter a valid quantity";
    if (!reason)          e.reason          = "Enter a reason for this adjustment";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  const { submit, loading } = useSubmit({
    module: "stock_adjustment",
    endpoint: "/inventory/adjustments",
    onSuccess: () =>
      Alert.alert(
        "Adjustment Submitted",
        "Stock adjustment has been submitted for approval.",
        [{ text: "OK", onPress: () => navigation.goBack() }]
      ),
  });

  async function handleSubmit() {
    if (!validate()) return;
    const item = warehouseItems.find((i) => i.id === inventoryItemId);
    await submit({
      warehouseId,
      productId:      item?.product?.id,
      adjustmentType,
      quantity:       signedQty,
      reason,
    });
  }

  return (
    <ScreenWrapper footer={<FormFooter saveLabel="Submit Adjustment" onSave={handleSubmit} loading={loading} />}>
      <View style={styles.pageHeader}>
        <View style={styles.pageIconWrap}>
          <MaterialCommunityIcons name="tune-variant" size={22} color={colors.brand} />
        </View>
        <View>
          <Text style={styles.title}>Stock Adjustment</Text>
          <Text style={styles.sub}>Correct stock counts or write off losses</Text>
        </View>
      </View>

      <FormCard label="STOCK ITEM">
        <SelectField label="Warehouse" value={warehouseId} options={warehouses}
          onChange={(v) => { setWarehouseId(v); setInventoryItemId(""); setErrors((e) => ({ ...e, warehouseId: "" })); }}
          error={errors.warehouseId} required placeholder="Select warehouse…" />

        <SelectField label="Stock Item" value={inventoryItemId} options={itemOptions}
          onChange={(v) => { setInventoryItemId(v); setErrors((e) => ({ ...e, inventoryItemId: "" })); }}
          error={errors.inventoryItemId} required placeholder={warehouseId ? "Select item…" : "Select warehouse first"} />

        {selectedItem && (
          <View style={styles.stockCard}>
            <Text style={styles.stockCardLabel}>Current Stock</Text>
            <Text style={styles.stockCardValue}>{Number(selectedItem.quantityOnHand)}</Text>
            <Text style={styles.stockCardSub}>{selectedItem.warehouse.name}</Text>
          </View>
        )}
      </FormCard>

      <FormCard label="ADJUSTMENT DATA">
        <SelectField label="Adjustment Type" value={adjustmentType} options={ADJ_TYPE_OPTIONS}
          onChange={onTypeChange}
          error={errors.adjustmentType} required placeholder="Select type…" />

        {adjustmentType && (
          <Text style={styles.typeDesc}>
            {ADJ_TYPES.find((t) => t.value === adjustmentType)?.desc}
          </Text>
        )}

        {/* Direction toggle */}
        <View style={styles.dirLabel}>
          <Text style={styles.fieldLabel}>Direction <Text style={styles.required}>*</Text></Text>
        </View>
        <View style={styles.dirToggle}>
          {(["add", "remove"] as const).map((d) => (
            <TouchableOpacity
              key={d}
              style={[styles.dirBtn, direction === d && (d === "add" ? styles.dirBtnAddActive : styles.dirBtnRemoveActive)]}
              onPress={() => setDirection(d)}
              activeOpacity={0.8}
            >
              <Text style={[styles.dirBtnText, direction === d && styles.dirBtnTextActive]}>
                {d === "add" ? "＋  Add to Stock" : "－  Remove from Stock"}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <FormField label="Quantity" value={quantity}
          onChangeText={(v) => { setQuantity(v); setErrors((e) => ({ ...e, quantity: "" })); }}
          keyboardType="decimal-pad" required error={errors.quantity} placeholder="0" />

        {selectedItem && qtyNum > 0 && (
          <View style={styles.previewCard}>
            <Text style={styles.previewLabel}>Stock After Adjustment</Text>
            <Text style={[
              styles.previewValue,
              { color: Number(selectedItem.quantityOnHand) + signedQty < 0 ? colors.error : colors.brand }
            ]}>
              {(Number(selectedItem.quantityOnHand) + signedQty).toFixed(2)}
            </Text>
          </View>
        )}

        <FormField label="Reason" value={reason}
          onChangeText={(v) => { setReason(v); setErrors((e) => ({ ...e, reason: "" })); }}
          required error={errors.reason} multiline numberOfLines={2}
          style={{ minHeight: 70, textAlignVertical: "top" } as any}
          placeholder="Explain why this adjustment is needed…" />

        <View style={styles.approvalNote}>
          <Text style={styles.approvalNoteText}>
            ℹ All adjustments require manager approval before stock is updated
          </Text>
        </View>
      </FormCard>
    </ScreenWrapper>
  );
}

const styles = StyleSheet.create({
  pageHeader:   { flexDirection: "row", alignItems: "center", gap: 12 },
  pageIconWrap: {
    width: 48, height: 48, borderRadius: 12,
    backgroundColor: colors.brandLight,
    borderWidth: 1, borderColor: colors.brandMid,
    alignItems: "center", justifyContent: "center",
  },
  title: { fontSize: font.size.xl, fontFamily: font.family.extrabold, color: colors.ink },
  sub:   { fontSize: font.size.sm, color: colors.inkMid, fontFamily: font.family.regular },

  stockCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#f0fdf4",
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: "#bbf7d0",
    padding: spacing.md,
  },
  stockCardLabel: { fontSize: font.size.sm, color: "#15803d" },
  stockCardValue: { fontSize: font.size.xxl, fontWeight: font.weight.extrabold, color: "#15803d" },
  stockCardSub:   { fontSize: font.size.xs, color: "#16a34a" },

  typeDesc: { fontSize: font.size.sm, color: colors.inkLight, fontStyle: "italic" },

  fieldLabel: { fontSize: font.size.sm, fontWeight: font.weight.semibold, color: colors.ink },
  required:   { color: colors.error },
  dirLabel:   { marginBottom: -spacing.xs },

  dirToggle: { flexDirection: "row", gap: spacing.sm },
  dirBtn: {
    flex: 1,
    paddingVertical: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderColor: colors.border,
    alignItems: "center",
    backgroundColor: colors.bgCard,
  },
  dirBtnAddActive:    { borderColor: "#16a34a", backgroundColor: "#f0fdf4" },
  dirBtnRemoveActive: { borderColor: colors.error, backgroundColor: "#fef2f2" },
  dirBtnText:         { fontSize: font.size.sm, fontWeight: font.weight.semibold, color: colors.inkLight },
  dirBtnTextActive:   { color: colors.ink },

  previewCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: colors.brandLight,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.brandMid,
    padding: spacing.md,
  },
  previewLabel: { fontSize: font.size.sm, color: colors.inkMid },
  previewValue: { fontSize: font.size.xxl, fontWeight: font.weight.extrabold },

  approvalNote: { backgroundColor: "#eff6ff", borderRadius: radius.md, padding: spacing.md, borderWidth: 1, borderColor: "#bfdbfe" },
  approvalNoteText: { fontSize: font.size.sm, color: "#1d4ed8" },
});
