import { useMemo, useState } from "react";
import { Alert, StyleSheet, Text, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { ScreenWrapper } from "../../components/ScreenWrapper";
import { FormCard } from "../../components/FormCard";
import { FormFooter } from "../../components/FormFooter";
import { FormField } from "../../components/FormField";
import { DateField } from "../../components/DateField";
import { SelectField, SelectOption } from "../../components/SelectField";
import { useSubmit } from "../../hooks/useSubmit";
import { useLookup } from "../../hooks/useLookup";
import { fetchFlockBatches, fetchFarms } from "../../api/endpoints";
import { useAuth } from "../../auth/AuthContext";
import { colors, font } from "../../constants/theme";

const COST_TYPES: SelectOption[] = [
  { label: "Feed",        value: "FEED"        },
  { label: "Medication",  value: "MEDICATION"  },
  { label: "Vaccination", value: "VACCINATION" },
  { label: "Labor",       value: "LABOR"       },
  { label: "Utilities",   value: "UTILITIES"   },
  { label: "Equipment",   value: "EQUIPMENT"   },
  { label: "Other",       value: "OTHER"       },
];

export function PoultryCostScreen() {
  const { user } = useAuth();
  const navigation = useNavigation<any>();
  const [farmId, setFarmId]         = useState("");
  const [batchId, setBatchId]       = useState("");
  const [costDate, setCostDate]     = useState(new Date().toISOString().split("T")[0]);
  const [costType, setCostType]     = useState("");
  const [amount, setAmount]         = useState("");
  const [description, setDescription] = useState("");
  const [errors, setErrors]         = useState<Record<string, string>>({});

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
    // (2026-08-28) Matches web's batch picker, which applies no status
    // filter — see DailyPoultryScreen's own note on this same change.
    () => (rawBatches ?? []).map((b: any) => ({ label: `${b.code} — ${b.name}`, value: b.id })),
    [rawBatches]
  );

  function validate() {
    const e: Record<string, string> = {};
    if (!farmId) e.farmId = "Select a farm";
    if (!batchId) e.batchId = "Select a batch";
    if (!costDate) e.costDate = "Date required";
    if (!costType) e.costType = "Select cost type";
    if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) e.amount = "Enter amount";
    if (!description.trim()) e.description = "Enter description";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  const { submit, loading } = useSubmit({
    module: "poultry_cost",
    endpoint: "/poultry/costs",
    // Mobile parity audit (2026-08-17): PoultryCostRecord now accepts idempotencyKey.
    sendIdempotencyKeyInBody: true,
    onSuccess: (queued) =>
      Alert.alert(
        queued ? "Saved Offline" : "Saved",
        queued
          ? "Your cost entry was saved on this device and will sync automatically once you're back online."
          : "Cost entry recorded.",
        [{ text: "OK", onPress: () => navigation.goBack() }]
      )
  });

  async function handleSubmit() {
    if (!validate()) return;
    await submit({
      flockBatchId: batchId,
      costDate,
      costType,
      amount: Number(amount),
      description: description.trim(),
    });
  }

  return (
    <ScreenWrapper footer={<FormFooter saveLabel="Save Cost Entry" onSave={handleSubmit} loading={loading} />}>
      <View style={styles.pageHeader}>
        <View style={styles.pageIconWrap}>
          <MaterialCommunityIcons name="currency-usd" size={22} color={colors.brand} />
        </View>
        <View>
          <Text style={styles.title}>Poultry Cost Entry</Text>
          <Text style={styles.sub}>Log a production cost to a flock batch</Text>
        </View>
      </View>

      <FormCard label="FLOCK / BATCH">
        <SelectField label="Farm" value={farmId} options={farms} onChange={(v) => { setFarmId(v); setBatchId(""); setErrors((e) => ({ ...e, farmId: "" })); }} error={errors.farmId} required />
        <SelectField label="Flock Batch" value={batchId} options={batches} onChange={(v) => { setBatchId(v); setErrors((e) => ({ ...e, batchId: "" })); }} error={errors.batchId} required placeholder={farmId ? "Select batch…" : "Select farm first"} />
        <DateField label="Cost Date" required value={costDate} onChangeText={(v) => { setCostDate(v); setErrors((e) => ({ ...e, costDate: "" })); }} error={errors.costDate} />
      </FormCard>

      <FormCard label="COST DETAILS">
        <SelectField label="Cost Type" value={costType} options={COST_TYPES} onChange={(v) => { setCostType(v); setErrors((e) => ({ ...e, costType: "" })); }} error={errors.costType} required />
        <FormField
          label="Amount (GHS)"
          required
          value={amount}
          onChangeText={(v) => { setAmount(v); setErrors((e) => ({ ...e, amount: "" })); }}
          error={errors.amount}
          keyboardType="decimal-pad"
          placeholder="e.g. 250.00"
        />
        <FormField
          label="Description"
          required
          value={description}
          onChangeText={(v) => { setDescription(v); setErrors((e) => ({ ...e, description: "" })); }}
          error={errors.description}
          placeholder="e.g. Feed purchase from supplier"
          multiline
          numberOfLines={2}
          style={{ minHeight: 70, textAlignVertical: "top" } as any}
        />
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
});
