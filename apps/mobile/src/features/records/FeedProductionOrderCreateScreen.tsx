import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { Icon } from "../../components/Icon";
import { PageHeader } from "../../components/PageHeader";
import { useToast } from "../../components/Toast";
import { createFeedProductionOrder, fetchFeedProductionOptions, type FeedFormula, type FeedProductionOptions } from "../../api/endpoints";
import { colors, font, radius, shadow, spacing } from "../../constants/theme";

export function FeedProductionOrderCreateScreen() {
  const navigation = useNavigation<any>();
  const toast = useToast();

  const [opts,       setOpts]       = useState<FeedProductionOptions["data"] | null>(null);
  const [loading,    setLoading]    = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const [formulaId,          setFormulaId]          = useState("");
  const [plannedQuantityKg,  setPlannedQuantityKg]  = useState("");
  const [scheduledDate,      setScheduledDate]      = useState(new Date().toISOString().split("T")[0]);
  const [productionSiteId,   setProductionSiteId]   = useState("");
  const [warehouseId,        setWarehouseId]        = useState("");
  const [notes,              setNotes]              = useState("");

  const load = useCallback(async () => {
    try {
      const res = await fetchFeedProductionOptions();
      setOpts(res.data);
      if (res.data.productionSites?.[0]) setProductionSiteId(res.data.productionSites[0].id);
      if (res.data.warehouses?.[0])      setWarehouseId(res.data.warehouses[0].id);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const selectedFormula = opts?.formulas?.find((f) => f.id === formulaId);

  async function handleSubmit() {
    if (!formulaId) { toast.show({ type: "warning", message: "Please select a formula." }); return; }
    const qty = Number(plannedQuantityKg);
    if (!qty || qty <= 0) { toast.show({ type: "warning", message: "Enter a valid planned quantity." }); return; }
    if (!scheduledDate)   { toast.show({ type: "warning", message: "Enter a scheduled date." }); return; }

    setSubmitting(true);
    try {
      const res = await createFeedProductionOrder({
        formulaId,
        plannedQuantityKg: qty,
        scheduledDate,
        productionSiteId: productionSiteId || undefined,
        warehouseId:      warehouseId      || undefined,
        notes:            notes            || undefined,
      });
      toast.show({ type: "success", message: `Order ${(res as any).data?.orderNumber ?? ""} created.` });
      navigation.goBack();
    } catch {
      toast.show({ type: "error", message: "Failed to create order. Try again." });
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
        <PageHeader icon="factory" iconColor="#d97706" title="New Production Order" />

        {/* Formula picker */}
        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Feed Formula *</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
            {(opts?.formulas ?? []).map((f: FeedFormula) => (
              <TouchableOpacity
                key={f.id}
                style={[styles.chip, formulaId === f.id && styles.chipActive]}
                onPress={() => setFormulaId(f.id)}
              >
                <Text style={[styles.chipText, formulaId === f.id && styles.chipTextActive]}>{f.name}</Text>
                <Text style={[styles.chipSub, formulaId === f.id && styles.chipSubActive]}>{f.code}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
          {selectedFormula && (
            <View style={styles.selectedInfo}>
              <Icon name="check-circle" size={14} color="#16a34a" />
              <Text style={styles.selectedText}>{selectedFormula.name} · {selectedFormula.feedType}</Text>
            </View>
          )}
        </View>

        {/* Quantity & date */}
        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Quantity & Schedule</Text>
          <View style={styles.row}>
            <View style={styles.field}>
              <Text style={styles.label}>Planned Qty (kg) *</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. 5000"
                placeholderTextColor={colors.inkLight}
                keyboardType="numeric"
                value={plannedQuantityKg}
                onChangeText={setPlannedQuantityKg}
              />
            </View>
            <View style={styles.field}>
              <Text style={styles.label}>Scheduled Date *</Text>
              <TextInput
                style={styles.input}
                placeholder="YYYY-MM-DD"
                placeholderTextColor={colors.inkLight}
                value={scheduledDate}
                onChangeText={setScheduledDate}
              />
            </View>
          </View>
        </View>

        {/* Production site */}
        {opts?.productionSites?.length ? (
          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>Production Site</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
              {opts.productionSites.map((s) => (
                <TouchableOpacity
                  key={s.id}
                  style={[styles.chip, productionSiteId === s.id && styles.chipActive]}
                  onPress={() => setProductionSiteId(s.id)}
                >
                  <Text style={[styles.chipText, productionSiteId === s.id && styles.chipTextActive]}>{s.name}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        ) : null}

        {/* Output warehouse */}
        {opts?.warehouses?.length ? (
          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>Output Warehouse</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
              {opts.warehouses.map((w) => (
                <TouchableOpacity
                  key={w.id}
                  style={[styles.chip, warehouseId === w.id && styles.chipActive]}
                  onPress={() => setWarehouseId(w.id)}
                >
                  <Text style={[styles.chipText, warehouseId === w.id && styles.chipTextActive]}>{w.name}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        ) : null}

        {/* Notes */}
        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Notes</Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            placeholder="Any special instructions…"
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
              <Icon name="factory" size={18} color={colors.white} />
              <Text style={styles.submitText}>Create Order</Text>
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

  sectionCard:  { backgroundColor: colors.bgCard, borderRadius: radius.xl, borderWidth: 1, borderColor: colors.border, padding: spacing.lg, gap: spacing.md, ...shadow.sm },
  sectionTitle: { fontSize: font.size.sm, fontFamily: font.family.extrabold, color: colors.inkLight, textTransform: "uppercase", letterSpacing: 0.8 },

  chips:        { gap: spacing.sm, paddingVertical: 2 },
  chip:         { paddingHorizontal: spacing.md, paddingVertical: 8, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.bg, minWidth: 100, alignItems: "center" },
  chipActive:   { borderColor: colors.brand, backgroundColor: colors.brandLight },
  chipText:     { fontSize: font.size.sm, fontFamily: font.family.semibold, color: colors.inkMid },
  chipTextActive: { color: colors.brand, fontFamily: font.family.bold },
  chipSub:      { fontSize: font.size.xs, color: colors.inkLight, fontFamily: font.family.regular },
  chipSubActive:{ color: colors.brand },

  selectedInfo: { flexDirection: "row", alignItems: "center", gap: 6, paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border },
  selectedText: { fontSize: font.size.sm, fontFamily: font.family.semibold, color: "#16a34a" },

  row:   { flexDirection: "row", gap: spacing.md },
  field: { flex: 1, gap: spacing.xs },
  label: { fontSize: font.size.xs, fontFamily: font.family.semibold, color: colors.inkMid },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, fontSize: font.size.sm, fontFamily: font.family.regular, color: colors.ink, backgroundColor: colors.bg },
  textArea: { minHeight: 80, textAlignVertical: "top" },

  submitBtn:  { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm, backgroundColor: colors.brand, borderRadius: radius.xl, paddingVertical: spacing.lg },
  submitText: { fontSize: font.size.md, fontFamily: font.family.bold, color: colors.white },
});
