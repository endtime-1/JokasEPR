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
  { label: "Eye drop", value: "EYE_DROP" },
  { label: "Drinking water", value: "DRINKING_WATER" },
  { label: "Injection (SC)", value: "INJECTION_SC" },
  { label: "Injection (IM)", value: "INJECTION_IM" },
  { label: "Spray", value: "SPRAY" },
  { label: "Wing web", value: "WING_WEB" }
];

export function VaccinationScreen() {
  const { user } = useAuth();
  const navigation = useNavigation<any>();
  const [farmId, setFarmId] = useState("");
  const [batchId, setBatchId] = useState("");
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [vaccineName, setVaccineName] = useState("");
  const [dose, setDose] = useState("");
  const [nextDueDate, setNextDueDate] = useState("");
  const [notes, setNotes] = useState("");
  // inventory link (optional)
  const [warehouseId, setWarehouseId] = useState("");
  const [vaccineProductId, setVaccineProductId] = useState("");
  const [quantityUsed, setQuantityUsed] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});

  const { data: rawFarms } = useLookup("farms", async () => { const r = await fetchFarms(); return (r.data as any[]) ?? []; });
  const farms: SelectOption[] = useMemo(() => {
    const all = rawFarms ?? [];
    const assigned = (user?.hasGlobalAccess || !user?.farmIds?.length) ? all : all.filter((f: any) => user?.farmIds?.includes(f.id));
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
    if (!vaccineName.trim()) e.vaccineName = "Enter vaccine name";
    if (!dose.trim()) e.dose = "Enter dose";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  const { submit, loading } = useSubmit({
    module: "poultry_vaccination",
    endpoint: "/poultry/vaccination-records",
    onSuccess: () => Alert.alert("Saved", "Vaccination recorded.", [{ text: "OK", onPress: () => navigation.goBack() }])
  });

  async function handleSubmit() {
    if (!validate()) return;
    await submit({
      flockBatchId: batchId,
      vaccinationDate: date,
      vaccineName,
      dose,
      nextDueDate: nextDueDate || undefined,
      notes: notes || undefined,
      warehouseId: warehouseId || undefined,
      vaccineProductId: vaccineProductId || undefined,
      quantityUsed: quantityUsed ? Number(quantityUsed) : undefined,
    });
  }

  return (
    <ScreenWrapper footer={<FormFooter saveLabel="Save Vaccination" onSave={handleSubmit} loading={loading} />}>
      <View style={styles.pageHeader}>
        <View style={styles.pageIconWrap}>
          <MaterialCommunityIcons name="needle" size={22} color={colors.brand} />
        </View>
        <View>
          <Text style={styles.title}>Vaccination Record</Text>
          <Text style={styles.sub}>Record vaccine administered to flock</Text>
        </View>
      </View>

      <FormCard label="FLOCK / BATCH">
        <SelectField label="Farm" value={farmId} options={farms} onChange={(v) => { setFarmId(v); setBatchId(""); }} error={errors.farmId} required />
        <SelectField label="Flock Batch" value={batchId} options={batches} onChange={setBatchId} error={errors.batchId} required placeholder={farmId ? "Select batch…" : "Select farm first"} />
        <FormField label="Vaccination Date" required value={date} onChangeText={setDate} error={errors.date} keyboardType="numeric" placeholder="YYYY-MM-DD" />
      </FormCard>

      <FormCard label="VACCINE DATA">
        <FormField label="Vaccine Name" required value={vaccineName} onChangeText={(v) => { setVaccineName(v); setErrors((e) => ({ ...e, vaccineName: "" })); }} error={errors.vaccineName} placeholder="e.g. Newcastle ND Clone 30" />

        <View style={styles.row}>
          <View style={styles.half}>
            <FormField label="Dose" required value={dose} onChangeText={(v) => { setDose(v); setErrors((e) => ({ ...e, dose: "" })); }} error={errors.dose} placeholder="e.g. 1 drop/bird" />
          </View>
          <View style={styles.half}>
            <FormField label="Next Due Date" value={nextDueDate} onChangeText={setNextDueDate} keyboardType="numeric" placeholder="YYYY-MM-DD" />
          </View>
        </View>
      </FormCard>

      <FormCard label="NOTES">
        <FormField label="Notes" value={notes} onChangeText={setNotes} multiline numberOfLines={2} style={{ minHeight: 70, textAlignVertical: "top" } as any} placeholder="Optional notes…" />
      </FormCard>

      <FormCard label="INVENTORY LINK (OPTIONAL)">
        <SelectField label="Warehouse" value={warehouseId} options={warehouses} onChange={setWarehouseId} placeholder="No warehouse selected" />
        <SelectField label="Vaccine Product" value={vaccineProductId} options={products} onChange={setVaccineProductId} placeholder="No product selected" />
        <FormField label="Quantity Used" value={quantityUsed} onChangeText={setQuantityUsed} keyboardType="decimal-pad" placeholder="e.g. 50 (doses / vials / units)" />
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
