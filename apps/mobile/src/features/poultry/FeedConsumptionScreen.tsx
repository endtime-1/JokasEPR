import { useMemo, useState } from "react";
import { Alert, StyleSheet, Text, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { ScreenWrapper } from "../../components/ScreenWrapper";
import { FormField } from "../../components/FormField";
import { SelectField, SelectOption } from "../../components/SelectField";
import { Button } from "../../components/Button";
import { useSubmit } from "../../hooks/useSubmit";
import { useLookup } from "../../hooks/useLookup";
import { fetchFlockBatches, fetchFarms, fetchWarehouses, fetchProducts } from "../../api/endpoints";
import { useAuth } from "../../auth/AuthContext";
import { colors, font, spacing } from "../../constants/theme";

export function FeedConsumptionScreen() {
  const { user } = useAuth();
  const navigation = useNavigation<any>();
  const [farmId, setFarmId] = useState("");
  const [batchId, setBatchId] = useState("");
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [quantityKg, setQuantityKg] = useState("");
  const [costAmount, setCostAmount] = useState("");
  const [notes, setNotes] = useState("");
  // inventory link (optional)
  const [warehouseId, setWarehouseId] = useState("");
  const [feedProductId, setFeedProductId] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});

  const { data: rawFarms } = useLookup("farms", async () => { const r = await fetchFarms(); return (r.data as any[]) ?? []; });
  const farms: SelectOption[] = useMemo(() => {
    const all = rawFarms ?? [];
    const assigned = user?.hasGlobalAccess ? all : all.filter((f: any) => user?.farmIds?.includes(f.id));
    return assigned.map((f: any) => ({ label: f.name, value: f.id }));
  }, [rawFarms, user]);

  const { data: rawBatches } = useLookup(
    `flockBatches:${farmId}`,
    async () => { const r = await fetchFlockBatches(farmId); return (r.data as any[]) ?? []; },
    !farmId
  );
  const batches: SelectOption[] = useMemo(
    () => (rawBatches ?? []).map((b: any) => ({ label: b.code ?? b.batchCode ?? b.name, value: b.id })),
    [rawBatches]
  );

  const { data: rawWarehouses } = useLookup("warehouses", async () => { const r = await fetchWarehouses(); return (r.data as any[]) ?? []; });
  const warehouses: SelectOption[] = useMemo(
    () => (rawWarehouses ?? []).map((w: any) => ({ label: w.name, value: w.id })),
    [rawWarehouses]
  );

  const { data: rawProducts } = useLookup("products", async () => { const r = await fetchProducts(); return (r.data as any[]) ?? []; });
  const products: SelectOption[] = useMemo(
    () => (rawProducts ?? []).map((p: any) => ({ label: `${p.sku} — ${p.name}`, value: p.id })),
    [rawProducts]
  );

  function validate() {
    const e: Record<string, string> = {};
    if (!farmId) e.farmId = "Select farm";
    if (!batchId) e.batchId = "Select batch";
    if (!date) e.date = "Date required";
    if (!quantityKg || isNaN(Number(quantityKg)) || Number(quantityKg) <= 0) e.quantityKg = "Enter quantity";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  const { submit, loading } = useSubmit({
    module: "poultry_feed",
    endpoint: "/poultry/feed-consumption-records",
    onSuccess: () => Alert.alert("Saved", "Feed consumption recorded.", [{ text: "OK", onPress: () => navigation.goBack() }])
  });

  return (
    <ScreenWrapper>
      <Text style={styles.title}>Feed Consumption</Text>
      <Text style={styles.sub}>Record feed given to flock</Text>

      <SelectField label="Farm" value={farmId} options={farms} onChange={(v) => { setFarmId(v); setBatchId(""); }} error={errors.farmId} required />
      <SelectField label="Flock Batch" value={batchId} options={batches} onChange={setBatchId} error={errors.batchId} required placeholder={farmId ? "Select batch…" : "Select farm first"} />
      <FormField label="Date" required value={date} onChangeText={setDate} error={errors.date} keyboardType="numeric" placeholder="YYYY-MM-DD" />

      <View style={styles.row}>
        <View style={styles.half}>
          <FormField label="Quantity (kg)" required value={quantityKg} onChangeText={(v) => { setQuantityKg(v); setErrors((e) => ({ ...e, quantityKg: "" })); }} error={errors.quantityKg} keyboardType="decimal-pad" placeholder="e.g. 250" />
        </View>
        <View style={styles.half}>
          <FormField label="Cost (GHS)" value={costAmount} onChangeText={setCostAmount} keyboardType="decimal-pad" placeholder="Optional" />
        </View>
      </View>

      <FormField label="Notes" value={notes} onChangeText={setNotes} multiline numberOfLines={2} style={{ minHeight: 70, textAlignVertical: "top" } as any} placeholder="Optional notes…" />

      <Text style={styles.sectionLabel}>Inventory Link (Optional)</Text>
      <Text style={styles.sectionHint}>Select warehouse and product to auto-deduct stock when saved.</Text>
      <SelectField label="Warehouse" value={warehouseId} options={warehouses} onChange={setWarehouseId} placeholder="No warehouse selected" />
      <SelectField label="Feed Product" value={feedProductId} options={products} onChange={setFeedProductId} placeholder="No product selected" />

      <Button label="Save Feed Record" loading={loading} onPress={async () => {
        if (!validate()) return;
        await submit({
          flockBatchId: batchId,
          recordDate: date,
          quantityKg: Number(quantityKg),
          costAmount: costAmount ? Number(costAmount) : undefined,
          notes: notes || undefined,
          warehouseId: warehouseId || undefined,
          feedProductId: feedProductId || undefined,
        });
      }} size="lg" />
    </ScreenWrapper>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: font.size.xl, fontWeight: font.weight.bold, color: colors.ink },
  sub: { fontSize: font.size.sm, color: colors.inkMid, marginTop: -spacing.sm },
  row: { flexDirection: "row", gap: spacing.md },
  half: { flex: 1 },
  sectionLabel: { fontSize: font.size.sm, fontWeight: font.weight.bold, color: colors.inkMid, marginTop: spacing.sm },
  sectionHint: { fontSize: font.size.xs, color: colors.inkLight, marginTop: -spacing.sm }
});
