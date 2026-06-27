import { useMemo, useState } from "react";
import { Alert, StyleSheet, Text, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { ScreenWrapper } from "../../components/ScreenWrapper";
import { FormField } from "../../components/FormField";
import { SelectField, SelectOption } from "../../components/SelectField";
import { Button } from "../../components/Button";
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

  return (
    <ScreenWrapper>

      {/* Page header */}
      <View style={styles.pageHeader}>
        <View style={styles.pageIconWrap}>
          <Text style={styles.pageIconText}>🏭</Text>
        </View>
        <View style={styles.pageHeaderText}>
          <Text style={styles.pageTitle}>Production Record</Text>
          <Text style={styles.pageSub}>Log output from a production run</Text>
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

      <SelectField label="Production Order" value={orderId} options={orders}
        onChange={(v) => { setOrderId(v); setErrors((e) => ({ ...e, orderId: "" })); }}
        error={errors.orderId} required placeholder="Select order…" />

      <FormField label="Batch Number" value={batchNumber} onChangeText={setBatchNumber}
        placeholder="e.g. BATCH-2026-001" />

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

      <FormField label="Notes" value={notes} onChangeText={setNotes} multiline numberOfLines={3}
        style={{ minHeight: 80, textAlignVertical: "top" } as any}
        placeholder="Optional notes about this production run…" />

      <Button label="Save Production Record" loading={loading} onPress={async () => {
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
      }} size="lg" />

    </ScreenWrapper>
  );
}

const styles = StyleSheet.create({
  pageHeader: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  pageIconWrap: {
    width: 52, height: 52, borderRadius: radius.lg,
    backgroundColor: colors.brandLight, borderWidth: 1, borderColor: colors.brandMid,
    alignItems: "center", justifyContent: "center",
  },
  pageIconText: { fontSize: 26 },
  pageHeaderText: { gap: 2 },
  pageTitle: { fontSize: font.size.xl, fontWeight: font.weight.extrabold, color: colors.ink },
  pageSub: { fontSize: font.size.sm, color: colors.inkLight },

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
