import { useMemo, useState } from "react";
import { Alert, StyleSheet, Text, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { ScreenWrapper } from "../../components/ScreenWrapper";
import { FormCard } from "../../components/FormCard";
import { FormFooter } from "../../components/FormFooter";
import { FormField } from "../../components/FormField";
import { SelectField, SelectOption } from "../../components/SelectField";
import { useSubmit } from "../../hooks/useSubmit";
import { useLookup } from "../../hooks/useLookup";
import { fetchWarehouses, fetchInventoryItems } from "../../api/endpoints";
import { useAuth } from "../../auth/AuthContext";
import { colors, font, radius, spacing } from "../../constants/theme";

const MOVEMENT_TYPES: SelectOption[] = [
  { label: "Purchase Receipt",   value: "PURCHASE_RECEIPT"  },
  { label: "Production Output",  value: "PRODUCTION_OUTPUT" },
  { label: "Sale Dispatch",      value: "SALE_DISPATCH"     },
  { label: "Transfer (Out)",     value: "TRANSFER"          },
  { label: "Adjustment (In)",    value: "ADJUSTMENT_IN"     },
  { label: "Adjustment (Out)",   value: "ADJUSTMENT_OUT"    },
  { label: "Waste / Write-off",  value: "WASTE"             },
];

const MOVEMENT_META: Record<string, { icon: string; color: string }> = {
  PURCHASE_RECEIPT:  { icon: "📥", color: "#16a34a" },
  PRODUCTION_OUTPUT: { icon: "🏭", color: "#0891b2" },
  SALE_DISPATCH:     { icon: "📤", color: "#d97706" },
  TRANSFER:          { icon: "🔄", color: "#7c3aed" },
  ADJUSTMENT_IN:     { icon: "➕", color: "#16a34a" },
  ADJUSTMENT_OUT:    { icon: "➖", color: "#dc2626" },
  WASTE:             { icon: "🗑️", color: "#64748b" },
};

export function StockMovementScreen() {
  const { user } = useAuth();
  const navigation = useNavigation<any>();

  const [warehouseId,  setWarehouseId]  = useState("");
  const [itemId,       setItemId]       = useState("");
  const [movementType, setMovementType] = useState("");
  const [quantity,     setQuantity]     = useState("");
  const [unitCost,     setUnitCost]     = useState("");
  const [reference,    setReference]    = useState("");
  const [notes,        setNotes]        = useState("");

  const [errors, setErrors] = useState<Record<string, string>>({});

  const { data: rawWarehouses } = useLookup("warehouses", async () => { const r = await fetchWarehouses(); return (r.data as any[]) ?? []; });
  const warehouses: SelectOption[] = useMemo(() => {
    const all = rawWarehouses ?? [];
    const assigned = (user?.hasGlobalAccess || !user?.warehouseIds?.length) ? all : all.filter((w: any) => user?.warehouseIds?.includes(w.id));
    return assigned.map((w: any) => ({ label: w.name, value: w.id }));
  }, [rawWarehouses, user]);

  const { data: rawItems } = useLookup(
    `inventoryItems:${warehouseId}`,
    async () => { const r = await fetchInventoryItems(warehouseId); return (r.data as any[]) ?? []; },
    !warehouseId
  );
  const items: SelectOption[] = useMemo(
    () => (rawItems ?? []).map((i: any) => ({
      label: `${i.product?.name ?? i.id} (${i.product?.sku ?? ""})`,
      value: i.id,
    })),
    [rawItems]
  );

  function validate() {
    const e: Record<string, string> = {};
    if (!warehouseId) e.warehouseId = "Select a warehouse";
    if (!itemId) e.itemId = "Select an item";
    if (!movementType) e.movementType = "Select movement type";
    if (!quantity || isNaN(Number(quantity)) || Number(quantity) <= 0) e.quantity = "Enter a valid quantity";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  const { submit, loading } = useSubmit({
    module: "stock_movement",
    endpoint: "/inventory/stock-movements",
    onSuccess: () => Alert.alert("Recorded", "Stock movement has been saved.", [{ text: "OK", onPress: () => navigation.goBack() }]),
  });

  const movMeta = movementType ? MOVEMENT_META[movementType] : null;

  async function handleSubmit() {
    if (!validate()) return;
    await submit({
      warehouseId, inventoryItemId: itemId, movementType,
      quantity: Number(quantity),
      unitCost: unitCost ? Number(unitCost) : undefined,
      referenceNumber: reference || undefined,
      notes: notes || undefined,
    });
  }

  return (
    <ScreenWrapper footer={<FormFooter saveLabel="Record Movement" onSave={handleSubmit} loading={loading} />}>
      <View style={styles.pageHeader}>
        <View style={styles.pageIconWrap}>
          <MaterialCommunityIcons name="swap-horizontal" size={22} color={colors.brand} />
        </View>
        <View>
          <Text style={styles.title}>Stock Movement</Text>
          <Text style={styles.sub}>Record inventory in / out / transfer</Text>
        </View>
      </View>

      {/* Movement type badge preview */}
      {movMeta && (
        <View style={[styles.movTypeBadge, { backgroundColor: movMeta.color + "15", borderColor: movMeta.color + "40" }]}>
          <Text style={styles.movTypeIcon}>{movMeta.icon}</Text>
          <Text style={[styles.movTypeText, { color: movMeta.color }]}>
            {MOVEMENT_TYPES.find((t) => t.value === movementType)?.label}
          </Text>
        </View>
      )}

      <FormCard label="MOVEMENT DETAILS">
        <SelectField label="Warehouse" value={warehouseId} options={warehouses}
          onChange={(v) => { setWarehouseId(v); setItemId(""); setErrors((e) => ({ ...e, warehouseId: "" })); }}
          error={errors.warehouseId} required />

        <SelectField label="Item" value={itemId} options={items}
          onChange={(v) => { setItemId(v); setErrors((e) => ({ ...e, itemId: "" })); }}
          error={errors.itemId} required placeholder={warehouseId ? "Select item…" : "Select warehouse first"} />

        <SelectField label="Movement Type" value={movementType} options={MOVEMENT_TYPES}
          onChange={(v) => { setMovementType(v); setErrors((e) => ({ ...e, movementType: "" })); }}
          error={errors.movementType} required />

        <View style={styles.row}>
          <View style={styles.half}>
            <FormField label="Quantity" required value={quantity}
              onChangeText={(v) => { setQuantity(v); setErrors((e) => ({ ...e, quantity: "" })); }}
              error={errors.quantity} keyboardType="decimal-pad" placeholder="e.g. 100" />
          </View>
          <View style={styles.half}>
            <FormField label="Unit Cost (GHS)" value={unitCost} onChangeText={setUnitCost}
              keyboardType="decimal-pad" placeholder="Optional" />
          </View>
        </View>

        <FormField label="Reference / Document No." value={reference} onChangeText={setReference}
          placeholder="e.g. GRN-2026-001" />
      </FormCard>

      <FormCard label="NOTES">
        <FormField label="Notes" value={notes} onChangeText={setNotes} multiline numberOfLines={2}
          style={{ minHeight: 70, textAlignVertical: "top" } as any} placeholder="Optional notes…" />
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

  movTypeBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    borderRadius: radius.lg,
    padding: spacing.md,
    borderWidth: 1,
  },
  movTypeIcon: { fontSize: 20 },
  movTypeText: { fontSize: font.size.sm, fontWeight: font.weight.bold },

  row: { flexDirection: "row", gap: spacing.md },
  half: { flex: 1 },
});
