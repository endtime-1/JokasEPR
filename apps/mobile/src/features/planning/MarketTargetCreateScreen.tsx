import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { Icon } from "../../components/Icon";
import { PageHeader } from "../../components/PageHeader";
import { useToast } from "../../components/Toast";
import { fetchProducts, submitMarketTarget } from "../../api/endpoints";
import { colors, font, radius, shadow, spacing } from "../../constants/theme";

type TargetLine = { productId: string; productName: string; targetQuantityKg: string };

const emptyLine = (): TargetLine => ({ productId: "", productName: "", targetQuantityKg: "" });

export function MarketTargetCreateScreen() {
  const navigation = useNavigation<any>();
  const toast = useToast();

  const [products,   setProducts]   = useState<{ id: string; name: string; sku: string }[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd,   setPeriodEnd]   = useState("");
  const [notes,       setNotes]       = useState("");
  const [items,       setItems]       = useState<TargetLine[]>([emptyLine()]);

  const load = useCallback(async () => {
    try {
      const res = await fetchProducts();
      setProducts((res.data as any) ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  function updateItem(idx: number, field: keyof TargetLine, val: string) {
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, [field]: val } : it)));
  }

  function selectProduct(idx: number, product: { id: string; name: string }) {
    setItems((prev) => prev.map((it, i) => i === idx ? { ...it, productId: product.id, productName: product.name } : it));
  }

  function addItem() { setItems((prev) => [...prev, emptyLine()]); }

  function removeItem(idx: number) {
    if (items.length === 1) return;
    setItems((prev) => prev.filter((_, i) => i !== idx));
  }

  async function handleSubmit() {
    if (!periodStart || !periodEnd) { toast.show({ type: "warning", message: "Enter period start and end dates." }); return; }
    const validItems = items.filter((it) => it.productId && Number(it.targetQuantityKg) > 0);
    if (!validItems.length) { toast.show({ type: "warning", message: "Add at least one product with a target quantity." }); return; }

    setSubmitting(true);
    try {
      await submitMarketTarget({
        periodStart,
        periodEnd,
        notes: notes || undefined,
        items: validItems.map((it) => ({
          productId:        it.productId,
          targetQuantityKg: Number(it.targetQuantityKg),
        })),
      });
      toast.show({ type: "success", message: "Market target created." });
      navigation.goBack();
    } catch {
      toast.show({ type: "error", message: "Failed to create target. Try again." });
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
        <PageHeader icon="bullseye-arrow" iconColor={colors.brand} title="New Market Target" />

        {/* Period */}
        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Target Period *</Text>
          <View style={styles.dateRow}>
            <View style={styles.dateField}>
              <Text style={styles.label}>Start Date</Text>
              <TextInput style={styles.input} placeholder="YYYY-MM-DD" placeholderTextColor={colors.inkLight} value={periodStart} onChangeText={setPeriodStart} />
            </View>
            <Icon name="arrow-right" size={18} color={colors.inkLight} />
            <View style={styles.dateField}>
              <Text style={styles.label}>End Date</Text>
              <TextInput style={styles.input} placeholder="YYYY-MM-DD" placeholderTextColor={colors.inkLight} value={periodEnd} onChangeText={setPeriodEnd} />
            </View>
          </View>
        </View>

        {/* Target items */}
        <View style={styles.sectionCard}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Products & Targets *</Text>
            <TouchableOpacity style={styles.addBtn} onPress={addItem}>
              <Icon name="plus" size={16} color={colors.brand} />
              <Text style={styles.addText}>Add Product</Text>
            </TouchableOpacity>
          </View>

          {items.map((item, i) => (
            <View key={i} style={styles.lineItem}>
              <View style={styles.lineHeader}>
                <Text style={styles.lineNum}>Item {i + 1}</Text>
                {items.length > 1 && (
                  <TouchableOpacity onPress={() => removeItem(i)} hitSlop={8}>
                    <Icon name="trash-can-outline" size={16} color={colors.error} />
                  </TouchableOpacity>
                )}
              </View>

              {/* Product picker — scroll horizontally */}
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.productChips}>
                {products.slice(0, 20).map((p) => (
                  <TouchableOpacity
                    key={p.id}
                    style={[styles.productChip, item.productId === p.id && styles.productChipActive]}
                    onPress={() => selectProduct(i, p)}
                  >
                    <Text style={[styles.productChipText, item.productId === p.id && styles.productChipTextActive]} numberOfLines={1}>{p.name}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              <View style={styles.qtyRow}>
                <Text style={styles.label}>Target Quantity (kg)</Text>
                <TextInput
                  style={styles.input}
                  placeholder="e.g. 10000"
                  placeholderTextColor={colors.inkLight}
                  keyboardType="numeric"
                  value={item.targetQuantityKg}
                  onChangeText={(v) => updateItem(i, "targetQuantityKg", v)}
                />
              </View>
            </View>
          ))}
        </View>

        {/* Notes */}
        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Notes</Text>
          <TextInput style={[styles.input, styles.textArea]} placeholder="Additional context…" placeholderTextColor={colors.inkLight} multiline numberOfLines={3} value={notes} onChangeText={setNotes} />
        </View>

        {/* Submit */}
        <TouchableOpacity style={styles.submitBtn} onPress={handleSubmit} disabled={submitting} activeOpacity={0.8}>
          {submitting ? <ActivityIndicator size="small" color={colors.white} /> : (
            <>
              <Icon name="bullseye-arrow" size={18} color={colors.white} />
              <Text style={styles.submitText}>Create Target</Text>
            </>
          )}
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: colors.bg },
  scroll: { padding: spacing.xl, paddingBottom: spacing.xxxl, gap: spacing.md },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },

  sectionCard:   { backgroundColor: colors.bgCard, borderRadius: radius.xl, borderWidth: 1, borderColor: colors.border, padding: spacing.lg, gap: spacing.md, ...shadow.sm },
  sectionHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  sectionTitle:  { fontSize: font.size.sm, fontFamily: font.family.extrabold, color: colors.inkLight, textTransform: "uppercase", letterSpacing: 0.8 },

  dateRow:   { flexDirection: "row", alignItems: "flex-end", gap: spacing.sm },
  dateField: { flex: 1, gap: spacing.xs },
  label:     { fontSize: font.size.xs, fontFamily: font.family.semibold, color: colors.inkMid },
  input:     { borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, fontSize: font.size.sm, fontFamily: font.family.regular, color: colors.ink, backgroundColor: colors.bg },
  textArea:  { minHeight: 80, textAlignVertical: "top" },

  addBtn:  { flexDirection: "row", alignItems: "center", gap: 4 },
  addText: { fontSize: font.size.sm, fontFamily: font.family.semibold, color: colors.brand },

  lineItem:   { gap: spacing.sm, paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.border },
  lineHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  lineNum:    { fontSize: font.size.xs, fontFamily: font.family.bold, color: colors.inkLight, textTransform: "uppercase", letterSpacing: 0.6 },

  productChips:       { gap: spacing.sm, paddingVertical: 2 },
  productChip:        { paddingHorizontal: spacing.md, paddingVertical: 6, borderRadius: radius.full, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.bg, maxWidth: 160 },
  productChipActive:  { borderColor: colors.brand, backgroundColor: colors.brandLight },
  productChipText:    { fontSize: font.size.xs, fontFamily: font.family.medium, color: colors.inkMid },
  productChipTextActive: { color: colors.brand, fontFamily: font.family.bold },

  qtyRow:     { gap: spacing.xs },

  submitBtn:  { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm, backgroundColor: colors.brand, borderRadius: radius.xl, paddingVertical: spacing.lg },
  submitText: { fontSize: font.size.md, fontFamily: font.family.bold, color: colors.white },
});
