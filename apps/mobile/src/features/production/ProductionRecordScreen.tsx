import { useEffect, useState } from "react";
import { Alert, StyleSheet, Text, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { ScreenWrapper } from "../../components/ScreenWrapper";
import { FormField } from "../../components/FormField";
import { SelectField, SelectOption } from "../../components/SelectField";
import { Button } from "../../components/Button";
import { useSubmit } from "../../hooks/useSubmit";
import { fetchProductionOrders } from "../../api/endpoints";
import { colors, font, spacing } from "../../constants/theme";

export function ProductionRecordScreen() {
  const navigation = useNavigation<any>();
  const [orderId, setOrderId] = useState("");
  const [batchNumber, setBatchNumber] = useState("");
  const [startTime, setStartTime] = useState(new Date().toISOString().slice(0, 16));
  const [endTime, setEndTime] = useState("");
  const [outputQtyKg, setOutputQtyKg] = useState("");
  const [qualityCheck, setQualityCheck] = useState("PASS");
  const [notes, setNotes] = useState("");
  const [orders, setOrders] = useState<SelectOption[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    fetchProductionOrders().then((r) => {
      setOrders(((r.data as any[]) ?? []).map((o) => ({ label: `${o.orderNumber}`, value: o.id })));
    }).catch(() => {});
  }, []);

  function validate() {
    const e: Record<string, string> = {};
    if (!orderId) e.orderId = "Select production order";
    if (!outputQtyKg || isNaN(Number(outputQtyKg)) || Number(outputQtyKg) <= 0) e.outputQtyKg = "Enter output quantity";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  const { submit, loading } = useSubmit({
    module: "production_record",
    endpoint: "/feed-production/batches",
    onSuccess: () => Alert.alert("Saved", "Production record saved.", [{ text: "OK", onPress: () => navigation.goBack() }])
  });

  const QC_OPTIONS: SelectOption[] = [
    { label: "Pass", value: "PASS" },
    { label: "Fail", value: "FAIL" },
    { label: "Conditional Pass", value: "CONDITIONAL" }
  ];

  return (
    <ScreenWrapper>
      <Text style={styles.title}>Production Record</Text>
      <Text style={styles.sub}>Log output from a production run</Text>

      <SelectField label="Production Order" value={orderId} options={orders} onChange={(v) => { setOrderId(v); setErrors((e) => ({ ...e, orderId: "" })); }} error={errors.orderId} required placeholder="Select order…" />
      <FormField label="Batch Number" value={batchNumber} onChangeText={setBatchNumber} placeholder="e.g. BATCH-2026-001" />

      <View style={styles.row}>
        <View style={styles.half}>
          <FormField label="Start Time" value={startTime} onChangeText={setStartTime} placeholder="YYYY-MM-DDTHH:MM" />
        </View>
        <View style={styles.half}>
          <FormField label="End Time" value={endTime} onChangeText={setEndTime} placeholder="YYYY-MM-DDTHH:MM" />
        </View>
      </View>

      <View style={styles.row}>
        <View style={styles.half}>
          <FormField label="Output (kg)" required value={outputQtyKg} onChangeText={(v) => { setOutputQtyKg(v); setErrors((e) => ({ ...e, outputQtyKg: "" })); }} error={errors.outputQtyKg} keyboardType="decimal-pad" placeholder="e.g. 5000" />
        </View>
        <View style={styles.half}>
          <SelectField label="Quality Check" value={qualityCheck} options={QC_OPTIONS} onChange={setQualityCheck} />
        </View>
      </View>

      <FormField label="Notes" value={notes} onChangeText={setNotes} multiline numberOfLines={3} style={{ minHeight: 80, textAlignVertical: "top" } as any} placeholder="Optional notes…" />

      <Button label="Save Production Record" loading={loading} onPress={async () => {
        if (!validate()) return;
        await submit({
          productionOrderId: orderId,
          batchNumber: batchNumber || undefined,
          startTime: startTime || undefined,
          endTime: endTime || undefined,
          outputQuantityKg: Number(outputQtyKg),
          qualityCheckResult: qualityCheck,
          notes: notes || undefined
        });
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
