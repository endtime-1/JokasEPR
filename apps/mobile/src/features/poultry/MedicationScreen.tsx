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
import { fetchFlockBatches, fetchFarms, fetchWarehouses, fetchProducts } from "../../api/endpoints";
import { useAuth } from "../../auth/AuthContext";
import { colors, font, spacing } from "../../constants/theme";

const ROUTE_OPTIONS: SelectOption[] = [
  { label: "Water (In drinking water)", value: "WATER" },
  { label: "Feed (In feed)", value: "FEED" },
  { label: "Injection", value: "INJECTION" },
  { label: "Spray", value: "SPRAY" },
  { label: "Other", value: "OTHER" }
];

export function MedicationScreen() {
  const { user } = useAuth();
  const navigation = useNavigation<any>();
  const [farmId, setFarmId] = useState("");
  const [batchId, setBatchId] = useState("");
  const [startDate, setStartDate] = useState(new Date().toISOString().split("T")[0]);
  const [endDate, setEndDate] = useState("");
  const [medicationName, setMedicationName] = useState("");
  const [dosage, setDosage] = useState("");
  const [route, setRoute] = useState("");
  const [notes, setNotes] = useState("");
  // inventory link (optional)
  const [warehouseId, setWarehouseId] = useState("");
  const [medicineProductId, setMedicineProductId] = useState("");
  const [quantityUsed, setQuantityUsed] = useState("");
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
    if (!startDate) e.startDate = "Date required";
    if (!medicationName.trim()) e.medicationName = "Enter medication name";
    if (!dosage.trim()) e.dosage = "Enter dosage";
    if (!route) e.route = "Select route";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  const { submit, loading } = useSubmit({
    module: "poultry_medication",
    endpoint: "/poultry/medication-records",
    onSuccess: () => Alert.alert("Saved", "Medication record saved.", [{ text: "OK", onPress: () => navigation.goBack() }])
  });

  async function handleSubmit() {
    if (!validate()) return;
    await submit({
      flockBatchId: batchId,
      startDate,
      endDate: endDate || undefined,
      medicationName,
      dosage,
      route,
      notes: notes || undefined,
      warehouseId: warehouseId || undefined,
      medicineProductId: medicineProductId || undefined,
      quantityUsed: quantityUsed ? Number(quantityUsed) : undefined,
    });
  }

  return (
    <ScreenWrapper footer={<FormFooter saveLabel="Save Medication" onSave={handleSubmit} loading={loading} />}>
      <View style={styles.pageHeader}>
        <View style={styles.pageIconWrap}>
          <MaterialCommunityIcons name="pill" size={22} color={colors.brand} />
        </View>
        <View>
          <Text style={styles.title}>Medication Record</Text>
          <Text style={styles.sub}>Record treatment administered to flock</Text>
        </View>
      </View>

      <FormCard label="FLOCK / BATCH">
        <SelectField label="Farm" value={farmId} options={farms} onChange={(v) => { setFarmId(v); setBatchId(""); }} error={errors.farmId} required />
        <SelectField label="Flock Batch" value={batchId} options={batches} onChange={setBatchId} error={errors.batchId} required placeholder={farmId ? "Select batch…" : "Select farm first"} />
        <FormField label="Start Date" required value={startDate} onChangeText={setStartDate} error={errors.startDate} keyboardType="numeric" placeholder="YYYY-MM-DD" />
      </FormCard>

      <FormCard label="MEDICATION DATA">
        <FormField label="Medication Name" required value={medicationName} onChangeText={(v) => { setMedicationName(v); setErrors((e) => ({ ...e, medicationName: "" })); }} error={errors.medicationName} placeholder="e.g. Amoxicillin 20%" />

        <View style={styles.row}>
          <View style={styles.half}>
            <FormField label="Dosage" required value={dosage} onChangeText={(v) => { setDosage(v); setErrors((e) => ({ ...e, dosage: "" })); }} error={errors.dosage} placeholder="e.g. 1g/L" />
          </View>
          <View style={styles.half}>
            <SelectField label="Route" value={route} options={ROUTE_OPTIONS} onChange={(v) => { setRoute(v); setErrors((e) => ({ ...e, route: "" })); }} error={errors.route} required />
          </View>
        </View>

        <FormField label="End Date" value={endDate} onChangeText={setEndDate} keyboardType="numeric" placeholder="YYYY-MM-DD (optional)" />
      </FormCard>

      <FormCard label="NOTES">
        <FormField label="Notes / Diagnosis" value={notes} onChangeText={setNotes} multiline numberOfLines={2} style={{ minHeight: 70, textAlignVertical: "top" } as any} placeholder="e.g. Respiratory infection treatment…" />
      </FormCard>

      <FormCard label="INVENTORY LINK (OPTIONAL)">
        <SelectField label="Warehouse" value={warehouseId} options={warehouses} onChange={setWarehouseId} placeholder="No warehouse selected" />
        <SelectField label="Medicine Product" value={medicineProductId} options={products} onChange={setMedicineProductId} placeholder="No product selected" />
        <FormField label="Quantity Used" value={quantityUsed} onChangeText={setQuantityUsed} keyboardType="decimal-pad" placeholder="e.g. 0.5 (kg / litres / units)" />
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
  row: { flexDirection: "row", gap: spacing.md },
  half: { flex: 1 },
});
