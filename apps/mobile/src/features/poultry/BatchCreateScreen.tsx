import { useMemo, useState } from "react";
import { Alert, StyleSheet, Text, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { ScreenWrapper } from "../../components/ScreenWrapper";
import { FormCard } from "../../components/FormCard";
import { FormFooter } from "../../components/FormFooter";
import { FormField } from "../../components/FormField";
import { SelectField, SelectOption } from "../../components/SelectField";
import { useLookup } from "../../hooks/useLookup";
import { fetchPoultryOptions, createFlockBatch } from "../../api/endpoints";
import { useAuth } from "../../auth/AuthContext";
import { colors, font, spacing } from "../../constants/theme";

const BIRD_TYPES: SelectOption[] = [
  { label: "Broiler", value: "BROILER" },
  { label: "Layer", value: "LAYER" },
  { label: "Breeder", value: "BREEDER" },
  { label: "Pullet", value: "PULLET" },
];

export function BatchCreateScreen() {
  const { user } = useAuth();
  const navigation = useNavigation<any>();
  const [farmId, setFarmId]                     = useState("");
  const [houseId, setHouseId]                   = useState("");
  const [penId, setPenId]                       = useState("");
  const [batchName, setBatchName]               = useState("");
  const [birdType, setBirdType]                 = useState("");
  const [openingBirdCount, setOpeningBirdCount] = useState("");
  const [startDate, setStartDate]               = useState(new Date().toISOString().split("T")[0]);
  const [expectedCloseDate, setExpectedCloseDate] = useState("");
  const [loading, setLoading]                   = useState(false);
  const [errors, setErrors]                     = useState<Record<string, string>>({});

  const { data: opts } = useLookup("poultry-options", fetchPoultryOptions);

  const farms: SelectOption[] = useMemo(() => {
    const all = opts?.data.farms ?? [];
    const assigned = (user?.hasGlobalAccess || !user?.farmIds?.length) ? all : all.filter((f) => user?.farmIds?.includes(f.id));
    return assigned.map((f) => ({ label: f.name, value: f.id }));
  }, [opts, user]);

  const houses: SelectOption[] = useMemo(
    () => (opts?.data.houses ?? []).filter((h) => h.farmId === farmId).map((h) => ({ label: `${h.code} — ${h.name}`, value: h.id })),
    [opts, farmId]
  );

  const pens: SelectOption[] = useMemo(
    () => (opts?.data.pens ?? []).filter((p) => p.poultryHouseId === houseId).map((p) => ({ label: `Pen ${p.penNumber} — ${p.name}`, value: p.id })),
    [opts, houseId]
  );

  function validate() {
    const e: Record<string, string> = {};
    if (!farmId)  e.farmId  = "Select a farm";
    if (!houseId) e.houseId = "Select a house";
    if (!penId)   e.penId   = "Select a pen";
    if (!birdType) e.birdType = "Select bird type";
    if (!openingBirdCount || isNaN(Number(openingBirdCount)) || Number(openingBirdCount) <= 0)
      e.openingBirdCount = "Enter bird count";
    if (!startDate) e.startDate = "Date required";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function handleSubmit() {
    if (!validate()) return;
    setLoading(true);
    try {
      await createFlockBatch({
        name: batchName || undefined,
        birdType,
        startDate,
        expectedCloseDate: expectedCloseDate || undefined,
        penAllocations: [{ penId, openingBirdCount: Number(openingBirdCount) }],
      });
      Alert.alert("Created", "Flock batch created successfully.", [{ text: "OK", onPress: () => navigation.goBack() }]);
    } catch (err: any) {
      Alert.alert("Error", err.message ?? "Failed to create batch");
    } finally {
      setLoading(false);
    }
  }

  return (
    <ScreenWrapper footer={<FormFooter saveLabel="Create Batch" onSave={handleSubmit} loading={loading} />}>
      <View style={styles.pageHeader}>
        <View style={styles.pageIconWrap}>
          <MaterialCommunityIcons name="bird" size={22} color={colors.brand} />
        </View>
        <View>
          <Text style={styles.title}>New Flock Batch</Text>
          <Text style={styles.sub}>Register a new batch to a pen</Text>
        </View>
      </View>

      <FormCard label="LOCATION">
        <SelectField label="Farm" value={farmId} options={farms} onChange={(v) => { setFarmId(v); setHouseId(""); setPenId(""); setErrors((e) => ({ ...e, farmId: "" })); }} error={errors.farmId} required placeholder="Select farm…" />
        <SelectField label="House" value={houseId} options={houses} onChange={(v) => { setHouseId(v); setPenId(""); setErrors((e) => ({ ...e, houseId: "" })); }} error={errors.houseId} required placeholder={farmId ? "Select house…" : "Select farm first"} />
        <SelectField label="Pen" value={penId} options={pens} onChange={(v) => { setPenId(v); setErrors((e) => ({ ...e, penId: "" })); }} error={errors.penId} required placeholder={houseId ? "Select pen…" : "Select house first"} />
      </FormCard>

      <FormCard label="BATCH DETAILS">
        <SelectField label="Bird Type" value={birdType} options={BIRD_TYPES} onChange={(v) => { setBirdType(v); setErrors((e) => ({ ...e, birdType: "" })); }} error={errors.birdType} required />
        <FormField label="Batch Name (optional)" value={batchName} onChangeText={setBatchName} placeholder="e.g. Batch Jan 2026" />
        <FormField
          label="Opening Bird Count"
          required
          value={openingBirdCount}
          onChangeText={(v) => { setOpeningBirdCount(v); setErrors((e) => ({ ...e, openingBirdCount: "" })); }}
          error={errors.openingBirdCount}
          keyboardType="numeric"
          placeholder="e.g. 5000"
        />
        <View style={styles.row}>
          <View style={styles.half}>
            <FormField
              label="Start Date"
              required
              value={startDate}
              onChangeText={(v) => { setStartDate(v); setErrors((e) => ({ ...e, startDate: "" })); }}
              error={errors.startDate}
              keyboardType="numeric"
              placeholder="YYYY-MM-DD"
            />
          </View>
          <View style={styles.half}>
            <FormField
              label="Expected Close Date"
              value={expectedCloseDate}
              onChangeText={setExpectedCloseDate}
              keyboardType="numeric"
              placeholder="YYYY-MM-DD"
            />
          </View>
        </View>
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
  row:   { flexDirection: "row", gap: spacing.md },
  half:  { flex: 1 },
});
