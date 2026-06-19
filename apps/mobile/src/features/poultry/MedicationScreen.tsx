import { useEffect, useState } from "react";
import { Alert, StyleSheet, Text, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { ScreenWrapper } from "../../components/ScreenWrapper";
import { FormField } from "../../components/FormField";
import { SelectField, SelectOption } from "../../components/SelectField";
import { Button } from "../../components/Button";
import { useSubmit } from "../../hooks/useSubmit";
import { fetchFlockBatches, fetchFarms } from "../../api/endpoints";
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
  const [medicationName, setMedicationName] = useState("");
  const [dosage, setDosage] = useState("");
  const [route, setRoute] = useState("");
  const [durationDays, setDurationDays] = useState("1");
  const [purpose, setPurpose] = useState("");
  const [farms, setFarms] = useState<SelectOption[]>([]);
  const [batches, setBatches] = useState<SelectOption[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    fetchFarms().then((r) => {
      const all = (r.data as any[]) ?? [];
      const assigned = user?.hasGlobalAccess ? all : all.filter((f) => user?.farmIds?.includes(f.id));
      setFarms(assigned.map((f) => ({ label: f.name, value: f.id })));
    }).catch(() => {});
  }, [user]);

  useEffect(() => {
    if (!farmId) return;
    fetchFlockBatches(farmId).then((r) => {
      setBatches(((r.data as any[]) ?? []).map((b) => ({ label: b.batchCode, value: b.id })));
    }).catch(() => {});
  }, [farmId]);

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

  return (
    <ScreenWrapper>
      <Text style={styles.title}>Medication Record</Text>
      <Text style={styles.sub}>Record treatment administered to flock</Text>

      <SelectField label="Farm" value={farmId} options={farms} onChange={(v) => { setFarmId(v); setBatches([]); setBatchId(""); }} error={errors.farmId} required />
      <SelectField label="Flock Batch" value={batchId} options={batches} onChange={setBatchId} error={errors.batchId} required placeholder={farmId ? "Select batch…" : "Select farm first"} />
      <FormField label="Start Date" required value={startDate} onChangeText={setStartDate} error={errors.startDate} keyboardType="numeric" placeholder="YYYY-MM-DD" />
      <FormField label="Medication Name" required value={medicationName} onChangeText={(v) => { setMedicationName(v); setErrors((e) => ({ ...e, medicationName: "" })); }} error={errors.medicationName} placeholder="e.g. Amoxicillin 20%" />

      <View style={styles.row}>
        <View style={styles.half}>
          <FormField label="Dosage" required value={dosage} onChangeText={(v) => { setDosage(v); setErrors((e) => ({ ...e, dosage: "" })); }} error={errors.dosage} placeholder="e.g. 1g/L" />
        </View>
        <View style={styles.half}>
          <SelectField label="Route" value={route} options={ROUTE_OPTIONS} onChange={(v) => { setRoute(v); setErrors((e) => ({ ...e, route: "" })); }} error={errors.route} required />
        </View>
      </View>

      <View style={styles.row}>
        <View style={styles.half}>
          <FormField label="Duration (days)" value={durationDays} onChangeText={setDurationDays} keyboardType="numeric" placeholder="1" />
        </View>
        <View style={styles.half}>
          <FormField label="Purpose / Diagnosis" value={purpose} onChangeText={setPurpose} placeholder="e.g. Respiratory infection" />
        </View>
      </View>

      <Button label="Save Medication" loading={loading} onPress={async () => {
        if (!validate()) return;
        await submit({ farmId, flockBatchId: batchId, startDate, medicationName, dosage, administrationRoute: route, durationDays: Number(durationDays), purpose: purpose || undefined });
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
