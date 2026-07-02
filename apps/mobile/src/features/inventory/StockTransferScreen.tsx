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
import { fetchInventoryOptions } from "../../api/endpoints";
import { colors, font, radius, shadow, spacing } from "../../constants/theme";

export function StockTransferScreen() {
  const navigation = useNavigation<any>();

  const [fromWarehouseId, setFromWarehouseId] = useState("");
  const [toWarehouseId,   setToWarehouseId]   = useState("");
  const [productId,       setProductId]        = useState("");
  const [quantity,        setQuantity]         = useState("");
  const [notes,           setNotes]            = useState("");
  const [errors,          setErrors]           = useState<Record<string, string>>({});

  const { data: opts } = useLookup("inventory_options", async () => {
    const r = await fetchInventoryOptions();
    return r.data;
  });

  const warehouses: SelectOption[] = useMemo(
    () => (opts?.warehouses ?? []).map((w) => ({ label: w.name, value: w.id })),
    [opts]
  );

  const toWarehouses: SelectOption[] = useMemo(
    () => warehouses.filter((w) => w.value !== fromWarehouseId),
    [warehouses, fromWarehouseId]
  );

  // Only show products that exist in the selected source warehouse with stock > 0
  const sourceItems = useMemo(
    () => (opts?.items ?? []).filter((i) =>
      (!fromWarehouseId || i.warehouseId === fromWarehouseId) &&
      Number(i.quantityOnHand) > 0
    ),
    [opts, fromWarehouseId]
  );

  const productOptions: SelectOption[] = useMemo(
    () => sourceItems.map((i) => ({
      label: `${i.product.name} (${i.product.sku}) — ${Number(i.quantityOnHand)} available`,
      value: i.product.id,
    })),
    [sourceItems]
  );

  const selectedItem = useMemo(
    () => sourceItems.find((i) => i.product.id === productId),
    [sourceItems, productId]
  );

  const qtyNum = Number(quantity) || 0;
  const afterTransfer = selectedItem ? Number(selectedItem.quantityOnHand) - qtyNum : null;

  function validate() {
    const e: Record<string, string> = {};
    if (!fromWarehouseId)  e.fromWarehouseId = "Select source warehouse";
    if (!toWarehouseId)    e.toWarehouseId   = "Select destination warehouse";
    if (fromWarehouseId === toWarehouseId) e.toWarehouseId = "Source and destination must be different";
    if (!productId)        e.productId       = "Select a product to transfer";
    if (!quantity || qtyNum <= 0) e.quantity = "Enter a valid quantity";
    if (selectedItem && qtyNum > Number(selectedItem.quantityOnHand))
      e.quantity = `Cannot exceed available stock (${Number(selectedItem.quantityOnHand)})`;
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  const { submit, loading } = useSubmit({
    module: "stock_transfer",
    endpoint: "/inventory/transfers",
    onSuccess: () =>
      Alert.alert(
        "Transfer Complete",
        `${qtyNum} units have been transferred successfully.`,
        [{ text: "OK", onPress: () => navigation.goBack() }]
      ),
  });

  async function handleSubmit() {
    if (!validate()) return;
    await submit({
      fromWarehouseId,
      toWarehouseId,
      productId,
      quantity: qtyNum,
      notes: notes || undefined,
    });
  }

  return (
    <ScreenWrapper footer={<FormFooter saveLabel="Transfer Stock" onSave={handleSubmit} loading={loading} />}>
      <View style={styles.pageHeader}>
        <View style={styles.pageIconWrap}>
          <MaterialCommunityIcons name="transfer" size={22} color={colors.brand} />
        </View>
        <View>
          <Text style={styles.title}>Stock Transfer</Text>
          <Text style={styles.sub}>Move stock between warehouses</Text>
        </View>
      </View>

      <FormCard label="TRANSFER ROUTE">
        {/* Route card */}
        <View style={styles.routeCard}>
          <View style={styles.routeWh}>
            <Text style={styles.routeLabel}>FROM</Text>
            <Text style={styles.routeWh_name} numberOfLines={1}>
              {fromWarehouseId
                ? warehouses.find((w) => w.value === fromWarehouseId)?.label ?? "—"
                : "Select below"}
            </Text>
          </View>
          <Text style={styles.routeArrow}>→</Text>
          <View style={[styles.routeWh, styles.routeWhRight]}>
            <Text style={[styles.routeLabel, { textAlign: "right" }]}>TO</Text>
            <Text style={[styles.routeWh_name, { textAlign: "right" }]} numberOfLines={1}>
              {toWarehouseId
                ? warehouses.find((w) => w.value === toWarehouseId)?.label ?? "—"
                : "Select below"}
            </Text>
          </View>
        </View>

        <SelectField label="From Warehouse" value={fromWarehouseId} options={warehouses}
          onChange={(v) => { setFromWarehouseId(v); setProductId(""); setErrors((e) => ({ ...e, fromWarehouseId: "" })); }}
          error={errors.fromWarehouseId} required placeholder="Select source warehouse…" />

        <SelectField label="To Warehouse" value={toWarehouseId} options={toWarehouses}
          onChange={(v) => { setToWarehouseId(v); setErrors((e) => ({ ...e, toWarehouseId: "" })); }}
          error={errors.toWarehouseId} required
          placeholder={fromWarehouseId ? "Select destination warehouse…" : "Select source warehouse first"} />
      </FormCard>

      <FormCard label="PRODUCT & QUANTITY">
        <SelectField label="Product" value={productId} options={productOptions}
          onChange={(v) => { setProductId(v); setErrors((e) => ({ ...e, productId: "" })); }}
          error={errors.productId} required
          placeholder={fromWarehouseId ? "Select product to transfer…" : "Select source warehouse first"} />

        {selectedItem && (
          <View style={styles.availableCard}>
            <Text style={styles.availableLabel}>Available in {selectedItem.warehouse.name}</Text>
            <Text style={styles.availableValue}>{Number(selectedItem.quantityOnHand)}</Text>
          </View>
        )}

        <FormField label="Quantity to Transfer" value={quantity}
          onChangeText={(v) => { setQuantity(v); setErrors((e) => ({ ...e, quantity: "" })); }}
          keyboardType="decimal-pad" required error={errors.quantity} placeholder="0" />

        {afterTransfer !== null && qtyNum > 0 && (
          <View style={styles.previewRow}>
            <View style={[styles.previewBox, { backgroundColor: "#fef2f2", borderColor: "#fca5a5" }]}>
              <Text style={[styles.previewBoxLabel, { color: "#b91c1c" }]}>Source After</Text>
              <Text style={[styles.previewBoxValue, { color: afterTransfer < 0 ? colors.error : "#b91c1c" }]}>
                {afterTransfer.toFixed(2)}
              </Text>
            </View>
            <Text style={styles.previewArrow}>→</Text>
            <View style={[styles.previewBox, { backgroundColor: "#f0fdf4", borderColor: "#bbf7d0" }]}>
              <Text style={[styles.previewBoxLabel, { color: "#15803d" }]}>Destination +</Text>
              <Text style={[styles.previewBoxValue, { color: "#15803d" }]}>{qtyNum.toFixed(2)}</Text>
            </View>
          </View>
        )}
      </FormCard>

      <FormCard label="NOTES">
        <FormField label="Notes" value={notes} onChangeText={setNotes}
          multiline numberOfLines={2}
          style={{ minHeight: 70, textAlignVertical: "top" } as any}
          placeholder="Reason for transfer (optional)…" />
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

  routeCard: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: colors.bg, borderRadius: radius.xl,
    borderWidth: 1, borderColor: colors.border, padding: spacing.lg, gap: spacing.sm,
  },
  routeWh:      { flex: 1, gap: 3 },
  routeWhRight: { alignItems: "flex-end" },
  routeLabel:   { fontSize: 10, fontWeight: font.weight.bold, color: colors.inkLight, letterSpacing: 1, textTransform: "uppercase" },
  routeWh_name: { fontSize: font.size.sm, fontWeight: font.weight.semibold, color: colors.ink },
  routeArrow:   { fontSize: font.size.xxl, color: colors.brand, fontWeight: font.weight.extrabold },

  availableCard: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    backgroundColor: "#f0fdf4", borderRadius: radius.lg, borderWidth: 1, borderColor: "#bbf7d0", padding: spacing.md,
  },
  availableLabel: { fontSize: font.size.sm, color: "#15803d" },
  availableValue: { fontSize: font.size.xxl, fontWeight: font.weight.extrabold, color: "#15803d" },

  previewRow:  { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  previewBox:  { flex: 1, borderRadius: radius.lg, borderWidth: 1, padding: spacing.md, gap: 2 },
  previewBoxLabel: { fontSize: font.size.xs, fontWeight: font.weight.semibold },
  previewBoxValue: { fontSize: font.size.xl, fontWeight: font.weight.extrabold },
  previewArrow:    { fontSize: font.size.xl, color: colors.inkLight },
});
