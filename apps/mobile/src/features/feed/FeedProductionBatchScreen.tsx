import { useCallback, useEffect, useMemo, useState } from "react";
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
import { fetchFeedProductionOptions, fetchOpenFeedOrders, FeedOrder } from "../../api/endpoints";
import { colors, font, radius, spacing } from "../../constants/theme";

export function FeedProductionBatchScreen() {
  const navigation = useNavigation<any>();

  const today = new Date().toISOString().split("T")[0];

  const [orderId,        setOrderId]        = useState("");
  const [rawWarehouseId, setRawWarehouseId] = useState("");
  const [finWarehouseId, setFinWarehouseId] = useState("");
  const [producedKg,     setProducedKg]     = useState("");
  const [wastageKg,      setWastageKg]      = useState("");
  const [batchNumber,    setBatchNumber]    = useState("");
  const [productionDate, setProductionDate] = useState(today);
  const [errors,         setErrors]         = useState<Record<string, string>>({});

  const [orders, setOrders] = useState<FeedOrder[]>([]);

  const { data: opts } = useLookup("feed_production_options", async () => {
    const r = await fetchFeedProductionOptions();
    return r.data;
  });

  useEffect(() => {
    fetchOpenFeedOrders()
      .then((r) => setOrders((r.data as FeedOrder[]) ?? []))
      .catch(() => {});
  }, []);

  const orderOptions: SelectOption[] = useMemo(
    () => orders
      .filter((o) => ["APPROVED", "IN_PROGRESS", "DRAFT"].includes(o.status))
      .map((o) => ({ label: `${o.formula?.name ?? "—"} · ${o.orderNumber} (${Number(o.plannedQuantityKg).toFixed(0)} kg)`, value: o.id })),
    [orders]
  );

  const warehouseOptions: SelectOption[] = useMemo(
    () => (opts?.warehouses ?? []).map((w) => ({ label: `${w.name} (${w.code})`, value: w.id })),
    [opts]
  );

  const selectedOrder = useMemo(() => orders.find((o) => o.id === orderId), [orders, orderId]);

  function validate() {
    const e: Record<string, string> = {};
    if (!orderId)        e.orderId        = "Select a production order";
    if (!rawWarehouseId) e.rawWarehouseId = "Select raw material warehouse";
    if (!finWarehouseId) e.finWarehouseId = "Select finished goods warehouse";
    if (!producedKg || isNaN(Number(producedKg)) || Number(producedKg) <= 0)
                         e.producedKg     = "Enter a valid produced quantity";
    if (!productionDate) e.productionDate = "Enter the production date";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  const { submit, loading } = useSubmit({
    module:   "feed_production_batch",
    endpoint: "/feed-production/batches",
    onSuccess: () =>
      Alert.alert(
        "Batch Logged",
        "Feed production batch has been recorded successfully.",
        [{ text: "OK", onPress: () => navigation.goBack() }]
      ),
  });

  async function handleSubmit() {
    if (!validate()) return;
    await submit({
      productionOrderId:      orderId,
      rawMaterialWarehouseId: rawWarehouseId,
      finishedWarehouseId:    finWarehouseId,
      producedQuantityKg:     Number(producedKg),
      ...(wastageKg      ? { wastageKg: Number(wastageKg) } : {}),
      ...(batchNumber    ? { batchNumber }                   : {}),
      ...(productionDate ? { productionDate }                : {}),
    });
  }

  return (
    <ScreenWrapper footer={<FormFooter saveLabel="Save Production Batch" onSave={handleSubmit} loading={loading} />}>
      <View style={styles.pageHeader}>
        <View style={styles.pageIconWrap}>
          <MaterialCommunityIcons name="cog-play" size={22} color={colors.brand} />
        </View>
        <View>
          <Text style={styles.title}>Log Production Batch</Text>
          <Text style={styles.sub}>Record feed mill batch output</Text>
        </View>
      </View>

      <FormCard label="PRODUCTION ORDER">
        <SelectField
          label="Production Order" value={orderId} options={orderOptions}
          onChange={(v) => { setOrderId(v); setErrors((e) => ({ ...e, orderId: "" })); }}
          required error={errors.orderId} placeholder="Select approved order…"
        />

        {selectedOrder && (
          <View style={styles.orderCard}>
            <Text style={styles.orderCardLabel}>Planned quantity</Text>
            <Text style={styles.orderCardValue}>{Number(selectedOrder.plannedQuantityKg).toFixed(0)} kg · {selectedOrder.status}</Text>
          </View>
        )}
      </FormCard>

      <FormCard label="WAREHOUSES">
        <SelectField
          label="Raw Material Warehouse" value={rawWarehouseId} options={warehouseOptions}
          onChange={(v) => { setRawWarehouseId(v); setErrors((e) => ({ ...e, rawWarehouseId: "" })); }}
          required error={errors.rawWarehouseId} placeholder="Select source warehouse…"
        />

        <SelectField
          label="Finished Goods Warehouse" value={finWarehouseId} options={warehouseOptions}
          onChange={(v) => { setFinWarehouseId(v); setErrors((e) => ({ ...e, finWarehouseId: "" })); }}
          required error={errors.finWarehouseId} placeholder="Select destination warehouse…"
        />
      </FormCard>

      <FormCard label="RECORD DATA">
        <View style={styles.row2}>
          <View style={styles.col2}>
            <FormField
              label="Produced (kg)" value={producedKg}
              onChangeText={(v) => { setProducedKg(v); setErrors((e) => ({ ...e, producedKg: "" })); }}
              required error={errors.producedKg} keyboardType="decimal-pad" placeholder="0.00"
            />
          </View>
          <View style={styles.col2}>
            <FormField
              label="Wastage (kg)" value={wastageKg}
              onChangeText={setWastageKg}
              keyboardType="decimal-pad" placeholder="0.00"
            />
          </View>
        </View>

        <View style={styles.row2}>
          <View style={styles.col2}>
            <FormField
              label="Production Date" value={productionDate}
              onChangeText={(v) => { setProductionDate(v); setErrors((e) => ({ ...e, productionDate: "" })); }}
              required error={errors.productionDate} keyboardType="numbers-and-punctuation" placeholder="YYYY-MM-DD"
            />
          </View>
          <View style={styles.col2}>
            <FormField
              label="Batch No. (optional)" value={batchNumber}
              onChangeText={setBatchNumber}
              placeholder="Auto-generated if blank"
            />
          </View>
        </View>

        {producedKg && selectedOrder && (
          <View style={[styles.yieldCard,
            Number(producedKg) >= Number(selectedOrder.plannedQuantityKg) * 0.9
              ? { backgroundColor: "#f0fdf4", borderColor: "#bbf7d0" }
              : { backgroundColor: "#fff7ed", borderColor: "#fed7aa" }
          ]}>
            <Text style={styles.yieldLabel}>Yield vs planned</Text>
            <Text style={styles.yieldValue}>
              {((Number(producedKg) / Number(selectedOrder.plannedQuantityKg)) * 100).toFixed(1)}%
              {"  "}({Number(producedKg).toFixed(0)} / {Number(selectedOrder.plannedQuantityKg).toFixed(0)} kg)
            </Text>
          </View>
        )}
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

  orderCard: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    backgroundColor: "#eff6ff", borderRadius: radius.lg, borderWidth: 1, borderColor: "#bfdbfe", padding: spacing.md,
  },
  orderCardLabel: { fontSize: font.size.xs, color: "#1d4ed8" },
  orderCardValue: { fontSize: font.size.sm, fontWeight: font.weight.semibold, color: "#1e40af" },

  row2: { flexDirection: "row", gap: spacing.md },
  col2: { flex: 1 },

  yieldCard:  { borderRadius: radius.lg, borderWidth: 1, padding: spacing.md, gap: 3 },
  yieldLabel: { fontSize: font.size.xs, color: colors.inkLight, fontWeight: font.weight.bold, textTransform: "uppercase", letterSpacing: 0.5 },
  yieldValue: { fontSize: font.size.md, fontWeight: font.weight.extrabold, color: colors.ink },
});
