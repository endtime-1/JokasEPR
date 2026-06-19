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
  const [route, setRoute] = useState("");
  const [dosage, setDosage] = useState("");
  const [birdsVaccinated, setBirdsVaccinated] = useState("");
  const [nextDueDate, setNextDueDate] = useState("");
  const [notes, setNotes] = useState("");
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
    if (!date) e.date = "Date required";
    if (!vaccineName.trim()) e.vaccineName = "Enter vaccine name";
    if (!route) e.route = "Select route";
    if (!birdsVaccinated || isNaN(Number(birdsVaccinated))) e.birdsVaccinated = "Enter count";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  const { submit, loading } = useSubmit({
    module: "poultry_vaccination",
    endpoint: "/poultry/vaccination-records",
    onSuccess: () => Alert.alert("Saved", "Vaccination recorded.", [{ text: "OK", onPress: () => navigation.goBack() }])
  });

  return (
    <ScreenWrapper>
      <Text style={styles.title}>Vaccination Record</Text>
      <Text style={styles.sub}>Record vaccine administered to flock</Text>

      <SelectField label="Farm" value={farmId} options={farms} onChange={(v) => { setFarmId(v); setBatches([]); setBatchId(""); }} error={errors.farmId} required />
      <SelectField label="Flock Batch" value={batchId} options={batches} onChange={setBatchId} error={errors.batchId} required placeholder={farmId ? "Select batch…" : "Select farm first"} />
      <FormField label="Vaccination Date" required value={date} onChangeText={setDate} error={errors.date} keyboardType="numeric" placeholder="YYYY-MM-DD" />
      <FormField label="Vaccine Name" required value={vaccineName} onChangeText={(v) => { setVaccineName(v); setErrors((e) => ({ ...e, vaccineName: "" })); }} error={errors.vaccineName} placeholder="e.g. Newcastle ND Clone 30" />

      <View style={styles.row}>
        <View style={styles.half}>
          <SelectField label="Route" value={route} options={ROUTE_OPTIONS} onChange={(v) => { setRoute(v); setErrors((e) => ({ ...e, route: "" })); }} error={errors.route} required />
        </View>
        <View style={styles.half}>
          <FormField label="Dosage" value={dosage} onChangeText={setDosage} placeholder="e.g. 1 drop/bird" />
        </View>
      </View>

      <View style={styles.row}>
        <View style={styles.half}>
          <FormField label="Birds Vaccinated" required value={birdsVaccinated} onChangeText={(v) => { setBirdsVaccinated(v); setErrors((e) => ({ ...e, birdsVaccinated: "" })); }} error={errors.birdsVaccinated} keyboardType="numeric" placeholder="e.g. 5000" />
        </View>
        <View style={styles.half}>
          <FormField label="Next Due Date" value={nextDueDate} onChangeText={setNextDueDate} keyboardType="numeric" placeholder="YYYY-MM-DD" />
        </View>
      </View>

      <FormField label="Notes" value={notes} onChangeText={setNotes} multiline numberOfLines={2} style={{ minHeight: 70, textAlignVertical: "top" } as any} placeholder="Optional notes…" />

      <Button label="Save Vaccination" loading={loading} onPress={async () => {
        if (!validate()) return;
        await submit({ farmId, flockBatchId: batchId, vaccinationDate: date, vaccineName, administrationRoute: route, dosage: dosage || undefined, birdsVaccinated: Number(birdsVaccinated), nextDueDate: nextDueDate || undefined, notes: notes || undefined });
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
