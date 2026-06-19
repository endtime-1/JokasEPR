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

export function EggCollectionScreen() {
  const { user } = useAuth();
  const navigation = useNavigation<any>();
  const [farmId, setFarmId] = useState("");
  const [batchId, setBatchId] = useState("");
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [totalEggs, setTotalEggs] = useState("");
  const [gradeA, setGradeA] = useState("");
  const [gradeB, setGradeB] = useState("");
  const [broken, setBroken] = useState("0");
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
    if (!farmId) e.farmId = "Select a farm";
    if (!batchId) e.batchId = "Select a batch";
    if (!date) e.date = "Date required";
    if (!totalEggs || isNaN(Number(totalEggs))) e.totalEggs = "Enter total eggs";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  const { submit, loading } = useSubmit({
    module: "poultry_eggs",
    endpoint: "/poultry/egg-production-records",
    onSuccess: () => Alert.alert("Saved", "Egg collection recorded.", [{ text: "OK", onPress: () => navigation.goBack() }])
  });

  return (
    <ScreenWrapper>
      <Text style={styles.title}>Egg Collection</Text>
      <Text style={styles.sub}>Daily egg count by grade</Text>

      <SelectField label="Farm" value={farmId} options={farms} onChange={(v) => { setFarmId(v); setBatches([]); setBatchId(""); }} error={errors.farmId} required />
      <SelectField label="Flock Batch" value={batchId} options={batches} onChange={setBatchId} error={errors.batchId} required placeholder={farmId ? "Select batch…" : "Select farm first"} />
      <FormField label="Collection Date" required value={date} onChangeText={setDate} error={errors.date} keyboardType="numeric" placeholder="YYYY-MM-DD" />

      <FormField label="Total Eggs Collected" required value={totalEggs} onChangeText={(v) => { setTotalEggs(v); setErrors((e) => ({ ...e, totalEggs: "" })); }} error={errors.totalEggs} keyboardType="numeric" placeholder="e.g. 4200" />

      <View style={styles.row}>
        <View style={styles.third}><FormField label="Grade A" value={gradeA} onChangeText={setGradeA} keyboardType="numeric" placeholder="0" /></View>
        <View style={styles.third}><FormField label="Grade B" value={gradeB} onChangeText={setGradeB} keyboardType="numeric" placeholder="0" /></View>
        <View style={styles.third}><FormField label="Broken" value={broken} onChangeText={setBroken} keyboardType="numeric" placeholder="0" /></View>
      </View>

      <FormField label="Notes" value={notes} onChangeText={setNotes} multiline numberOfLines={2} style={{ minHeight: 70, textAlignVertical: "top" } as any} placeholder="Optional notes…" />

      <Button label="Save Collection" loading={loading} onPress={async () => {
        if (!validate()) return;
        await submit({
          farmId, flockBatchId: batchId, collectionDate: date,
          totalEggs: Number(totalEggs),
          gradeA: gradeA ? Number(gradeA) : undefined,
          gradeB: gradeB ? Number(gradeB) : undefined,
          brokenEggs: Number(broken),
          notes: notes || undefined
        });
      }} size="lg" />
    </ScreenWrapper>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: font.size.xl, fontWeight: font.weight.bold, color: colors.ink },
  sub: { fontSize: font.size.sm, color: colors.inkMid, marginTop: -spacing.sm },
  row: { flexDirection: "row", gap: spacing.sm },
  third: { flex: 1 }
});
