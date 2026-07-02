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
import { fetchProductionOrders } from "../../api/endpoints";
import { colors, font, radius, spacing } from "../../constants/theme";

const QC_OPTIONS: SelectOption[] = [
  { label: "✅  Pass",             value: "PASS"        },
  { label: "❌  Fail",             value: "FAIL"        },
  { label: "⚠️  Conditional Pass", value: "CONDITIONAL" },
];

const QC_META: Record<string, { color: string; bg: string }> = {
  PASS:        { color: "#16a34a", bg: "#f0fdf4" },
  FAIL:        { color: "#dc2626", bg: "#fef2f2" },
  CONDITIONAL: { color: "#d97706", bg: "#fffbeb" },
};

export function ProductionRecordScreen() {
  const navigation = useNavigation<any>();
  const [orderId,      setOrderId]      = useState("");
  const [batchNumber,  setBatchNumber]  = useState("");
  const [startTime,    setStartTime]    = useState(new Date().toISOString().slice(0, 16));
  const [endTime,      setEndTime]      = useState("");
  const [outputQtyKg,  setOutputQtyKg]  = useState("");
  const [qualityCheck, setQualityCheck] = useState("PASS");
  const [notes,        setNotes]        = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});

  const { data: rawOrders } = useLookup("productionOrders", async () => { const r = await fetchProductionOrders(); return (r.data as any[]) ?? []; });
  const orders: SelectOption[] = useMemo(
    () => (rawOrders ?? []).map((o: any) => ({ label: o.orderNumber, value: o.id })),
    [rawOrders]
  );

  function validate() {
    const e: Record<string, string> = {};
    if (!orderId) e.orderId = "Select a production order";
    if (!outputQtyKg || isNaN(Number(outputQtyKg)) || Number(outputQtyKg) <= 0)
      e.outputQtyKg = "Enter a valid output quantity";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  const { submit, loading } = useSubmit({
    module: "production_record",
    endpoint: "/feed-production/batches",
    onSuccess: () =>
      Alert.alert("Saved", "Production record has been saved.", [{ text: "OK", onPress: () => navigation.goBack() }]),
  });

  const qcMeta = QC_META[qualityCheck];

  async function handleSubmit() {
    if (!validate()) return;
    await submit({
      productionOrderId: orderId,
      batchNumber: batchNumber || undefined,
      startTime: startTime || undefined,
      endTime: endTime || undefined,
      outputQuantityKg: Number(outputQtyKg),
      qualityCheckResult: qualityCheck,
      notes: notes || undefined,
    });
  }

  return (
    <ScreenWrapper footer={<FormFooter saveLabel="Save Production Record" onSave={handleSubmit} loading={loading} />}>
      <View style={styles.pageHeader}>
        <View style={styles.pageIconWrap}>
          <MaterialCommunityIcons name="factory" size={22} color={colors.brand} />
        </View>
        <View>
          <Text style={styles.title}>Production Record</Text>
          <Text style={styles.sub}>Log output from a production run</Text>
        </View>
      </View>

      {/* QC preview badge */}
      {qualityCheck && (
        <View style={[styles.qcBadge, { backgroundColor: qcMeta.bg, borderColor: qcMeta.color + "40" }]}>
          <Text style={[styles.qcBadgeLabel, { color: qcMeta.color }]}>Quality: </Text>
          <Text style={[styles.qcBadgeValue, { color: qcMeta.color }]}>
            {QC_OPTIONS.find((o) => o.value === qualityCheck)?.label ?? qualityCheck}
          </Text>
        </View>
      )}

      <FormCard label="PRODUCTION ORDER">
        <SelectField label="Production Order" value={orderId} options={orders}
          onChange={(v) => { setOrderId(v); setErrors((e) => ({ ...e, orderId: "" })); }}
          error={errors.orderId} required placeholder="Select order…" />

        <FormField label="Batch Number" value={batchNumber} onChangeText={setBatchNumber}
          placeholder="e.g. BATCH-2026-001" />
      </FormCard>

      <FormCard label="RECORD DATA">
        <View style={styles.row}>
          <View style={styles.half}>
            <FormField label="Start Time" value={startTime} onChangeText={setStartTime}
              placeholder="YYYY-MM-DDTHH:MM" />
          </View>
          <View style={styles.half}>
            <FormField label="End Time" value={endTime} onChangeText={setEndTime}
              placeholder="YYYY-MM-DDTHH:MM" />
          </View>
        </View>

        <View style={styles.row}>
          <View style={styles.half}>
            <FormField label="Output (kg)" required value={outputQtyKg}
              onChangeText={(v) => { setOutputQtyKg(v); setErrors((e) => ({ ...e, outputQtyKg: "" })); }}
              error={errors.outputQtyKg} keyboardType="decimal-pad" placeholder="e.g. 5000" />
          </View>
          <View style={styles.half}>
            <SelectField label="Quality Check" value={qualityCheck} options={QC_OPTIONS}
              onChange={setQualityCheck} />
          </View>
        </View>
      </FormCard>

      <FormCard label="NOTES">
        <FormField label="Notes" value={notes} onChangeText={setNotes} multiline numberOfLines={3}
          style={{ minHeight: 80, textAlignVertical: "top" } as any}
          placeholder="Optional notes about this production run…" />
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

  qcBadge: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: radius.lg,
    padding: spacing.md,
    borderWidth: 1,
  },
  qcBadgeLabel: { fontSize: font.size.sm, fontWeight: font.weight.medium },
  qcBadgeValue: { fontSize: font.size.sm, fontWeight: font.weight.bold },

  row: { flexDirection: "row", gap: spacing.md },
  half: { flex: 1 },
});
