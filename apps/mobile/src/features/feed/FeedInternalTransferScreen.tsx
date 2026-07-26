import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { FormField } from "../../components/FormField";
import { PageHeader } from "../../components/PageHeader";
import { SelectField, type SelectOption } from "../../components/SelectField";
import { useToast } from "../../components/Toast";
import { fetchFeedProductionOptions, submitFeedInternalTransfer, type FeedProductionOptions } from "../../api/endpoints";
import { useAuth } from "../../auth/AuthContext";
import { colors, font, radius, spacing } from "../../constants/theme";

export function FeedInternalTransferScreen() {
  const navigation = useNavigation<any>();
  const toast = useToast();
  const { user } = useAuth();

  const [opts,        setOpts]        = useState<FeedProductionOptions["data"] | null>(null);
  const [loading,     setLoading]     = useState(true);
  const [submitting,  setSubmitting]  = useState(false);

  const [fromWarehouseId, setFromWarehouseId] = useState("");
  const [toWarehouseId,   setToWarehouseId]   = useState("");
  const [productId,       setProductId]       = useState("");
  const [quantityKg,      setQuantityKg]      = useState("");
  const [notes,           setNotes]           = useState("");

  const load = useCallback(async () => {
    try {
      const res = await fetchFeedProductionOptions();
      setOpts(res.data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const warehouseOptions: SelectOption[] = useMemo(() => {
    const all = opts?.warehouses ?? [];
    const visible = user?.hasGlobalAccess
      ? all
      : all.filter((w) => (user?.warehouseIds ?? []).includes(w.id));
    return visible.map((w) => ({ label: w.name, value: w.id }));
  }, [opts, user]);

  const productOptions: SelectOption[] = useMemo(
    () => (opts?.finishedFeeds ?? []).map((f) => ({ label: f.name, value: f.id })),
    [opts]
  );

  async function handleSubmit() {
    if (!fromWarehouseId) { toast.show({ type: "warning", message: "Select a source warehouse." }); return; }
    if (!toWarehouseId)   { toast.show({ type: "warning", message: "Select a destination warehouse." }); return; }
    if (fromWarehouseId === toWarehouseId) { toast.show({ type: "warning", message: "Source and destination must differ." }); return; }
    if (!productId)       { toast.show({ type: "warning", message: "Select a product." }); return; }
    const qty = Number(quantityKg);
    if (!qty || qty <= 0) { toast.show({ type: "warning", message: "Enter a valid quantity." }); return; }

    setSubmitting(true);
    try {
      await submitFeedInternalTransfer({
        fromWarehouseId,
        toWarehouseId,
        productId,
        quantityKg: qty,
        notes: notes || undefined,
      });
      toast.show({ type: "success", message: "Transfer submitted successfully." });
      navigation.goBack();
    } catch {
      toast.show({ type: "error", message: "Failed to submit transfer. Try again." });
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.safe} edges={["bottom"]}>
        <View style={styles.center}><ActivityIndicator size="large" color={colors.brand} /></View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={["bottom"]}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <PageHeader icon="transfer" iconColor="#2563eb" title="Feed Internal Transfer" />

        <View style={styles.formCard}>
          <Text style={styles.sectionTitle}>Warehouses</Text>
          <SelectField
            label="From Warehouse"
            value={fromWarehouseId}
            options={warehouseOptions}
            onChange={setFromWarehouseId}
            placeholder="Select source warehouse…"
            required
          />
          <SelectField
            label="To Warehouse"
            value={toWarehouseId}
            options={warehouseOptions}
            onChange={setToWarehouseId}
            placeholder="Select destination warehouse…"
            required
          />
        </View>

        <View style={styles.formCard}>
          <Text style={styles.sectionTitle}>Product & Quantity</Text>
          <SelectField
            label="Finished Feed Product"
            value={productId}
            options={productOptions}
            onChange={setProductId}
            placeholder="Select product…"
            required
          />
          <FormField
            label="Quantity (kg)"
            value={quantityKg}
            onChangeText={setQuantityKg}
            placeholder="Enter quantity in kg"
            keyboardType="numeric"
            required
          />
        </View>

        <View style={styles.formCard}>
          <Text style={styles.sectionTitle}>Notes</Text>
          <FormField
            label="Notes (optional)"
            value={notes}
            onChangeText={setNotes}
            placeholder="Any additional notes…"
            multiline
            numberOfLines={3}
            style={styles.textArea}
          />
        </View>

        <TouchableOpacity style={styles.submitBtn} onPress={handleSubmit} disabled={submitting} activeOpacity={0.8}>
          {submitting ? (
            <ActivityIndicator size="small" color={colors.white} />
          ) : (
            <Text style={styles.submitText}>Submit Transfer</Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:         { flex: 1, backgroundColor: colors.bg },
  scroll:       { padding: spacing.xl, paddingBottom: spacing.xxxl, gap: spacing.md },
  center:       { flex: 1, alignItems: "center", justifyContent: "center" },

  formCard:     { backgroundColor: colors.bgCard, borderRadius: 20, borderWidth: 1, borderColor: "#E2E8F0", padding: spacing.lg, gap: spacing.md },
  sectionTitle: { fontSize: font.size.sm, fontFamily: font.family.extrabold, color: colors.inkLight, textTransform: "uppercase", letterSpacing: 0.8 },

  textArea:     { minHeight: 80, textAlignVertical: "top" },

  submitBtn:    { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm, backgroundColor: colors.brand, borderRadius: 20, paddingVertical: spacing.lg },
  submitText:   { fontSize: font.size.md, fontFamily: font.family.bold, color: colors.white },
});
