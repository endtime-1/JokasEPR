import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { Icon } from "../../components/Icon";
import { PageHeader } from "../../components/PageHeader";
import { useToast } from "../../components/Toast";
import { fetchProcurementOptions, submitPurchaseRequest, type ProcurementOptions } from "../../api/endpoints";
import { colors, font, radius, shadow, spacing } from "../../constants/theme";

type LineItem = { productName: string; quantity: string; unitCost: string; uomCode: string; notes: string };

const emptyLine = (): LineItem => ({ productName: "", quantity: "", unitCost: "", uomCode: "KG", notes: "" });

export function PurchaseRequestCreateScreen() {
  const navigation = useNavigation<any>();
  const toast = useToast();

  const [opts,       setOpts]       = useState<ProcurementOptions["data"] | null>(null);
  const [loading,    setLoading]    = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const [supplierId,  setSupplierId]  = useState("");
  const [notes,       setNotes]       = useState("");
  const [items,       setItems]       = useState<LineItem[]>([emptyLine()]);

  const load = useCallback(async () => {
    try {
      const res = await fetchProcurementOptions();
      setOpts(res.data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  function updateItem(index: number, field: keyof LineItem, value: string) {
    setItems((prev) => prev.map((it, i) => (i === index ? { ...it, [field]: value } : it)));
  }

  function addItem() { setItems((prev) => [...prev, emptyLine()]); }

  function removeItem(index: number) {
    if (items.length === 1) return;
    setItems((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSubmit() {
    const validItems = items.filter((it) => it.productName.trim() && Number(it.quantity) > 0);
    if (!validItems.length) {
      toast.show({ type: "warning", message: "Add at least one item with a name and quantity." });
      return;
    }
    setSubmitting(true);
    try {
      await submitPurchaseRequest({
        supplierId: supplierId || undefined,
        notes: notes || undefined,
        items: validItems.map((it) => ({
          productName: it.productName.trim(),
          quantity:    Number(it.quantity),
          unitCost:    it.unitCost ? Number(it.unitCost) : undefined,
          uomCode:     it.uomCode.trim() || "KG",
          notes:       it.notes || undefined,
        })),
      });
      toast.show({ type: "success", message: "Purchase request submitted." });
      navigation.goBack();
    } catch {
      toast.show({ type: "error", message: "Failed to submit. Try again." });
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

  const totalValue = items.reduce((sum, it) => sum + (Number(it.quantity) || 0) * (Number(it.unitCost) || 0), 0);

  return (
    <SafeAreaView style={styles.safe} edges={["bottom"]}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <PageHeader icon="file-document-plus" iconColor="#2563eb" title="New Purchase Request" />

        {/* Supplier selector */}
        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Supplier (optional)</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
            <TouchableOpacity
              style={[styles.chip, !supplierId && styles.chipActive]}
              onPress={() => setSupplierId("")}
            >
              <Text style={[styles.chipText, !supplierId && styles.chipTextActive]}>Any</Text>
            </TouchableOpacity>
            {(opts?.suppliers ?? []).map((s) => (
              <TouchableOpacity
                key={s.id}
                style={[styles.chip, supplierId === s.id && styles.chipActive]}
                onPress={() => setSupplierId(s.id)}
              >
                <Text style={[styles.chipText, supplierId === s.id && styles.chipTextActive]}>{s.name}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {/* Line items */}
        <View style={styles.sectionCard}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Items</Text>
            <TouchableOpacity style={styles.addItemBtn} onPress={addItem}>
              <Icon name="plus" size={16} color={colors.brand} />
              <Text style={styles.addItemText}>Add Item</Text>
            </TouchableOpacity>
          </View>

          {items.map((item, i) => (
            <View key={i} style={styles.lineItem}>
              <View style={styles.lineItemHeader}>
                <Text style={styles.lineItemNum}>Item {i + 1}</Text>
                {items.length > 1 && (
                  <TouchableOpacity onPress={() => removeItem(i)} hitSlop={8}>
                    <Icon name="trash-can-outline" size={16} color={colors.error} />
                  </TouchableOpacity>
                )}
              </View>
              <TextInput
                style={styles.input}
                placeholder="Product / material name *"
                placeholderTextColor={colors.inkLight}
                value={item.productName}
                onChangeText={(v) => updateItem(i, "productName", v)}
              />
              <View style={styles.row}>
                <TextInput
                  style={[styles.input, styles.flex2]}
                  placeholder="Qty *"
                  placeholderTextColor={colors.inkLight}
                  keyboardType="numeric"
                  value={item.quantity}
                  onChangeText={(v) => updateItem(i, "quantity", v)}
                />
                <TextInput
                  style={[styles.input, styles.flex1]}
                  placeholder="UOM"
                  placeholderTextColor={colors.inkLight}
                  value={item.uomCode}
                  onChangeText={(v) => updateItem(i, "uomCode", v)}
                  autoCapitalize="characters"
                />
                <TextInput
                  style={[styles.input, styles.flex2]}
                  placeholder="Unit cost"
                  placeholderTextColor={colors.inkLight}
                  keyboardType="numeric"
                  value={item.unitCost}
                  onChangeText={(v) => updateItem(i, "unitCost", v)}
                />
              </View>
              <TextInput
                style={styles.input}
                placeholder="Notes (optional)"
                placeholderTextColor={colors.inkLight}
                value={item.notes}
                onChangeText={(v) => updateItem(i, "notes", v)}
              />
            </View>
          ))}

          {totalValue > 0 && (
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Estimated Total</Text>
              <Text style={styles.totalValue}>
                GHS {totalValue.toLocaleString("en-GH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </Text>
            </View>
          )}
        </View>

        {/* Notes */}
        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Request Notes</Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            placeholder="Any additional context for the approver…"
            placeholderTextColor={colors.inkLight}
            multiline
            numberOfLines={3}
            value={notes}
            onChangeText={setNotes}
          />
        </View>

        {/* Submit */}
        <TouchableOpacity style={styles.submitBtn} onPress={handleSubmit} disabled={submitting} activeOpacity={0.8}>
          {submitting ? (
            <ActivityIndicator size="small" color={colors.white} />
          ) : (
            <>
              <Icon name="send-outline" size={18} color={colors.white} />
              <Text style={styles.submitText}>Submit Request</Text>
            </>
          )}
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:    { flex: 1, backgroundColor: colors.bg },
  scroll:  { padding: spacing.xl, paddingBottom: spacing.xxxl, gap: spacing.md },
  center:  { flex: 1, alignItems: "center", justifyContent: "center" },

  sectionCard:   { backgroundColor: colors.bgCard, borderRadius: radius.xl, borderWidth: 1, borderColor: colors.border, padding: spacing.lg, gap: spacing.md, ...shadow.sm },
  sectionHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  sectionTitle:  { fontSize: font.size.sm, fontFamily: font.family.extrabold, color: colors.inkLight, textTransform: "uppercase", letterSpacing: 0.8 },

  chips:       { gap: spacing.sm, paddingVertical: 2 },
  chip:        { paddingHorizontal: spacing.md, paddingVertical: 6, borderRadius: radius.full, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.bg },
  chipActive:  { borderColor: colors.brand, backgroundColor: colors.brandLight },
  chipText:    { fontSize: font.size.sm, fontFamily: font.family.medium, color: colors.inkMid },
  chipTextActive: { color: colors.brand, fontFamily: font.family.bold },

  addItemBtn:  { flexDirection: "row", alignItems: "center", gap: 4 },
  addItemText: { fontSize: font.size.sm, fontFamily: font.family.semibold, color: colors.brand },

  lineItem:       { gap: spacing.sm, paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.border },
  lineItemHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  lineItemNum:    { fontSize: font.size.xs, fontFamily: font.family.bold, color: colors.inkLight, textTransform: "uppercase", letterSpacing: 0.6 },

  input:    { borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, fontSize: font.size.sm, fontFamily: font.family.regular, color: colors.ink, backgroundColor: colors.bg },
  textArea: { minHeight: 80, textAlignVertical: "top" },
  row:      { flexDirection: "row", gap: spacing.sm },
  flex1:    { flex: 1 },
  flex2:    { flex: 2 },

  totalRow:   { flexDirection: "row", justifyContent: "space-between", alignItems: "center", borderTopWidth: 1.5, borderTopColor: colors.border, paddingTop: spacing.md, marginTop: spacing.sm },
  totalLabel: { fontSize: font.size.sm, fontFamily: font.family.bold, color: colors.inkMid },
  totalValue: { fontSize: font.size.md, fontFamily: font.family.extrabold, color: colors.ink },

  submitBtn:  { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm, backgroundColor: colors.brand, borderRadius: radius.xl, paddingVertical: spacing.lg },
  submitText: { fontSize: font.size.md, fontFamily: font.family.bold, color: colors.white },
});
