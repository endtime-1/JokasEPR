import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { FormField } from "../../components/FormField";
import { PageHeader } from "../../components/PageHeader";
import { SelectField, type SelectOption } from "../../components/SelectField";
import { useToast } from "../../components/Toast";
import { createFeedFormula, fetchFeedProducts } from "../../api/endpoints";
import { colors, font, radius, spacing } from "../../constants/theme";

const FEED_TYPE_OPTIONS: SelectOption[] = [
  { label: "Layer Mash",       value: "LAYER_MASH" },
  { label: "Broiler Starter",  value: "BROILER_STARTER" },
  { label: "Broiler Finisher", value: "BROILER_FINISHER" },
  { label: "Chick Mash",       value: "CHICK_MASH" },
  { label: "Grower Mash",      value: "GROWER_MASH" },
  { label: "Finisher Mash",    value: "FINISHER_MASH" },
];

export function FeedFormulaCreateScreen() {
  const navigation = useNavigation<any>();
  const toast = useToast();

  const [products,    setProducts]    = useState<{ id: string; name: string; sku: string }[]>([]);
  const [loadingOpts, setLoadingOpts] = useState(true);
  const [submitting,  setSubmitting]  = useState(false);

  const [name,               setName]               = useState("");
  const [code,               setCode]               = useState("");
  const [feedType,           setFeedType]           = useState("");
  const [targetBatchKg,      setTargetBatchKg]      = useState("");
  const [finishedProductId,  setFinishedProductId]  = useState("");

  const load = useCallback(async () => {
    try {
      const res = await fetchFeedProducts();
      setProducts((res.data as any) ?? []);
    } finally {
      setLoadingOpts(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const productOptions: SelectOption[] = useMemo(
    () => products.map((p) => ({ label: `${p.name} (${p.sku})`, value: p.id })),
    [products]
  );

  async function handleSubmit() {
    if (!name.trim())    { toast.show({ type: "warning", message: "Enter a formula name." }); return; }
    if (!code.trim())    { toast.show({ type: "warning", message: "Enter a formula code." }); return; }
    if (!feedType)       { toast.show({ type: "warning", message: "Select a feed type." }); return; }
    const batchKg = Number(targetBatchKg);
    if (!batchKg || batchKg <= 0) { toast.show({ type: "warning", message: "Enter a valid batch size in kg." }); return; }

    setSubmitting(true);
    try {
      await createFeedFormula({
        name: name.trim(),
        code: code.trim(),
        feedType,
        targetBatchKg: batchKg,
        finishedProductId: finishedProductId || undefined,
      });
      toast.show({ type: "success", message: "Formula created successfully." });
      navigation.goBack();
    } catch {
      toast.show({ type: "error", message: "Failed to create formula. Try again." });
    } finally {
      setSubmitting(false);
    }
  }

  if (loadingOpts) {
    return (
      <SafeAreaView style={styles.safe} edges={["bottom"]}>
        <View style={styles.center}><ActivityIndicator size="large" color={colors.brand} /></View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={["bottom"]}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <PageHeader icon="flask-outline" iconColor="#16a34a" title="New Feed Formula" />

        <View style={styles.formCard}>
          <Text style={styles.sectionTitle}>Formula Details</Text>
          <FormField
            label="Formula Name"
            value={name}
            onChangeText={setName}
            placeholder="e.g. Broiler Starter 2024"
            required
          />
          <FormField
            label="Formula Code"
            value={code}
            onChangeText={setCode}
            placeholder="e.g. BS-2024"
            autoCapitalize="characters"
            required
          />
        </View>

        <View style={styles.formCard}>
          <Text style={styles.sectionTitle}>Feed Type & Batch</Text>
          <SelectField
            label="Feed Type"
            value={feedType}
            options={FEED_TYPE_OPTIONS}
            onChange={setFeedType}
            placeholder="Select feed type…"
            required
          />
          <FormField
            label="Target Batch Size (kg)"
            value={targetBatchKg}
            onChangeText={setTargetBatchKg}
            placeholder="e.g. 5000"
            keyboardType="numeric"
            required
          />
        </View>

        <View style={styles.formCard}>
          <Text style={styles.sectionTitle}>Finished Product (Optional)</Text>
          <SelectField
            label="Finished Feed Product"
            value={finishedProductId}
            options={productOptions}
            onChange={setFinishedProductId}
            placeholder="Select product (optional)…"
          />
        </View>

        <TouchableOpacity style={styles.submitBtn} onPress={handleSubmit} disabled={submitting} activeOpacity={0.8}>
          {submitting ? (
            <ActivityIndicator size="small" color={colors.white} />
          ) : (
            <Text style={styles.submitText}>Create Formula</Text>
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

  submitBtn:    { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm, backgroundColor: colors.brand, borderRadius: 20, paddingVertical: spacing.lg },
  submitText:   { fontSize: font.size.md, fontFamily: font.family.bold, color: colors.white },
});
