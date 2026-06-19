import { useEffect, useState } from "react";
import { Alert, StyleSheet, Text, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { ScreenWrapper } from "../../components/ScreenWrapper";
import { FormField } from "../../components/FormField";
import { SelectField, SelectOption } from "../../components/SelectField";
import { Button } from "../../components/Button";
import { useSubmit } from "../../hooks/useSubmit";
import { fetchWarehouses, fetchInventoryItems } from "../../api/endpoints";
import { useAuth } from "../../auth/AuthContext";
import { colors, font, spacing } from "../../constants/theme";

const MOVEMENT_TYPES: SelectOption[] = [
  { label: "Purchase Receipt", value: "PURCHASE_RECEIPT" },
  { label: "Production Output", value: "PRODUCTION_OUTPUT" },
  { label: "Sale Dispatch", value: "SALE_DISPATCH" },
  { label: "Transfer (Out)", value: "TRANSFER" },
  { label: "Adjustment (In)", value: "ADJUSTMENT_IN" },
  { label: "Adjustment (Out)", value: "ADJUSTMENT_OUT" },
  { label: "Waste", value: "WASTE" }
];

export function StockMovementScreen() {
  const { user } = useAuth();
  const navigation = useNavigation<any>();
  const [warehouseId, setWarehouseId] = useState("");
  const [itemId, setItemId] = useState("");
  const [movementType, setMovementType] = useState("");
  const [quantity, setQuantity] = useState("");
  const [unitCost, setUnitCost] = useState("");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [warehouses, setWarehouses] = useState<SelectOption[]>([]);
  const [items, setItems] = useState<SelectOption[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    fetchWarehouses().then((r) => {
      const all = (r.data as any[]) ?? [];
      const assigned = user?.hasGlobalAccess ? all : all.filter((w) => user?.warehouseIds?.includes(w.id));
      setWarehouses(assigned.map((w) => ({ label: w.name, value: w.id })));
    }).catch(() => {});
  }, [user]);

  useEffect(() => {
    if (!warehouseId) { setItems([]); return; }
    fetchInventoryItems(warehouseId).then((r) => {
      setItems(((r.data as any[]) ?? []).map((i) => ({ label: `${i.product?.name ?? i.id} (${i.product?.sku ?? ""})`, value: i.id })));
    }).catch(() => {});
  }, [warehouseId]);

  function validate() {
    const e: Record<string, string> = {};
    if (!warehouseId) e.warehouseId = "Select warehouse";
    if (!itemId) e.itemId = "Select item";
    if (!movementType) e.movementType = "Select movement type";
    if (!quantity || isNaN(Number(quantity)) || Number(quantity) <= 0) e.quantity = "Enter quantity";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  const { submit, loading } = useSubmit({
    module: "stock_movement",
    endpoint: "/inventory/stock-movements",
    onSuccess: () => Alert.alert("Saved", "Stock movement recorded.", [{ text: "OK", onPress: () => navigation.goBack() }])
  });

  return (
    <ScreenWrapper>
      <Text style={styles.title}>Stock Movement</Text>
      <Text style={styles.sub}>Record inventory in/out/transfer</Text>

      <SelectField label="Warehouse" value={warehouseId} options={warehouses} onChange={(v) => { setWarehouseId(v); setItemId(""); setErrors((e) => ({ ...e, warehouseId: "" })); }} error={errors.warehouseId} required />
      <SelectField label="Item" value={itemId} options={items} onChange={(v) => { setItemId(v); setErrors((e) => ({ ...e, itemId: "" })); }} error={errors.itemId} required placeholder={warehouseId ? "Select item…" : "Select warehouse first"} />
      <SelectField label="Movement Type" value={movementType} options={MOVEMENT_TYPES} onChange={(v) => { setMovementType(v); setErrors((e) => ({ ...e, movementType: "" })); }} error={errors.movementType} required />

      <View style={styles.row}>
        <View style={styles.half}>
          <FormField label="Quantity" required value={quantity} onChangeText={(v) => { setQuantity(v); setErrors((e) => ({ ...e, quantity: "" })); }} error={errors.quantity} keyboardType="decimal-pad" placeholder="e.g. 100" />
        </View>
        <View style={styles.half}>
          <FormField label="Unit Cost (GHS)" value={unitCost} onChangeText={setUnitCost} keyboardType="decimal-pad" placeholder="Optional" />
        </View>
      </View>

      <FormField label="Reference / Document No." value={reference} onChangeText={setReference} placeholder="e.g. GRN-2026-001" />
      <FormField label="Notes" value={notes} onChangeText={setNotes} multiline numberOfLines={2} style={{ minHeight: 70, textAlignVertical: "top" } as any} placeholder="Optional notes…" />

      <Button label="Record Movement" loading={loading} onPress={async () => {
        if (!validate()) return;
        await submit({
          warehouseId, inventoryItemId: itemId, movementType, quantity: Number(quantity),
          unitCost: unitCost ? Number(unitCost) : undefined,
          referenceNumber: reference || undefined,
          notes: notes || undefined
        });
      }} size="lg" />
    </ScreenWrapper>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: font.size.xl, fontWeight: font.weight.bold, color: colors.ink },
  sub: { fontSize: font.size.sm, color: colors.inkMid, marginTop: -spacing.sm },
  row: { flexDirection: "row", gap: spacing.md },
  half: { flex: 1 }
});
