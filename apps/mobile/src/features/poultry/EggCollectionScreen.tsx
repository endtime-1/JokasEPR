import { useLayoutEffect, useMemo, useState } from "react";
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { FormField } from "../../components/FormField";
import { SelectField, SelectOption } from "../../components/SelectField";
import { Button } from "../../components/Button";
import { SyncBanner } from "../../components/SyncBanner";
import { useSubmit } from "../../hooks/useSubmit";
import { useLookup } from "../../hooks/useLookup";
import { fetchFlockBatches, fetchFarms, fetchWarehouses, fetchProducts } from "../../api/endpoints";
import { useAuth } from "../../auth/AuthContext";
import { colors, font, radius, shadow, spacing } from "../../constants/theme";

export function EggCollectionScreen() {
  const { user } = useAuth();
  const navigation = useNavigation<any>();

  const [farmId, setFarmId]           = useState("");
  const [batchId, setBatchId]         = useState("");
  const [date, setDate]               = useState(new Date().toISOString().split("T")[0]);
  const [goodEggs, setGoodEggs]       = useState("");
  const [crackedEggs, setCrackedEggs] = useState("0");
  const [dirtyEggs, setDirtyEggs]     = useState("0");
  const [brokenEggs, setBrokenEggs]   = useState("0");
  const [rejectedEggs, setRejectedEggs] = useState("0");
  const [notes, setNotes]             = useState("");
  const [warehouseId, setWarehouseId] = useState("");
  const [eggProductId, setEggProductId] = useState("");
  const [errors, setErrors]           = useState<Record<string, string>>({});

  // ── Lookups ──────────────────────────────────────────────────────────
  // Always show a back/close button in the header
  useLayoutEffect(() => {
    navigation.setOptions({
      headerLeft: () => (
        <TouchableOpacity onPress={() => navigation.goBack()} style={{ paddingHorizontal: 8 }}>
          <MaterialCommunityIcons name="arrow-left" size={24} color={colors.brand} />
        </TouchableOpacity>
      ),
    });
  }, [navigation]);

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
    () => (rawBatches ?? []).map((b: any) => ({ label: b.code ?? b.batchCode ?? b.name, value: b.id })),
    [rawBatches]
  );

  const { data: rawWarehouses } = useLookup("warehouses", async () => { const r = await fetchWarehouses(); return (r.data as any[]) ?? []; });
  const warehouses: SelectOption[] = useMemo(
    () => (rawWarehouses ?? []).map((w: any) => ({ label: w.name, value: w.id })),
    [rawWarehouses]
  );

  const { data: rawProducts } = useLookup("products", async () => { const r = await fetchProducts(); return (r.data as any[]) ?? []; });
  const products: SelectOption[] = useMemo(
    () => (rawProducts ?? []).map((p: any) => ({ label: `${p.sku} — ${p.name}`, value: p.id })),
    [rawProducts]
  );

  // ── Live totals ───────────────────────────────────────────────────────
  const good     = Math.max(0, Number(goodEggs)     || 0);
  const cracked  = Math.max(0, Number(crackedEggs)  || 0);
  const dirty    = Math.max(0, Number(dirtyEggs)    || 0);
  const broken   = Math.max(0, Number(brokenEggs)   || 0);
  const rejected = Math.max(0, Number(rejectedEggs) || 0);
  const totalCollected = good + cracked + dirty + broken + rejected;
  const totalRejects   = cracked + dirty + broken + rejected;

  // ── Validation ────────────────────────────────────────────────────────
  function validate() {
    const e: Record<string, string> = {};
    if (!farmId)  e.farmId  = "Select a farm";
    if (!batchId) e.batchId = "Select a batch";
    if (!date)    e.date    = "Date required";
    if (!goodEggs || isNaN(Number(goodEggs)) || Number(goodEggs) < 0)
      e.goodEggs = "Enter good egg count";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  const { submit, loading } = useSubmit({
    module: "poultry_eggs",
    endpoint: "/poultry/egg-production-records",
    onSuccess: () => Alert.alert("Saved", "Egg collection recorded.", [{ text: "OK", onPress: () => navigation.goBack() }])
  });

  async function handleSave() {
    if (!validate()) return;
    await submit({
      flockBatchId:  batchId,
      recordDate:    date,
      goodEggs,
      crackedEggs:   Number(crackedEggs)  || 0,
      dirtyEggs:     Number(dirtyEggs)    || 0,
      brokenEggs:    Number(brokenEggs)   || 0,
      rejectedEggs:  Number(rejectedEggs) || 0,
      notes:         notes || undefined,
      warehouseId:   warehouseId  || undefined,
      eggProductId:  eggProductId || undefined,
    });
  }

  return (
    <SafeAreaView style={styles.safe} edges={["bottom"]}>
      <SyncBanner />
      <KeyboardAvoidingView style={styles.fill} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* ── Header ── */}
          <View style={styles.pageHeader}>
            <View style={styles.pageIconWrap}>
              <MaterialCommunityIcons name="egg-outline" size={22} color={colors.brand} />
            </View>
            <View>
              <Text style={styles.title}>Egg Collection</Text>
              <Text style={styles.sub}>Daily egg count by quality grade</Text>
            </View>
          </View>

          {/* ── Flock Info ── */}
          <View style={styles.card}>
            <Text style={styles.cardLabel}>FLOCK DETAILS</Text>
            <SelectField label="Farm" value={farmId} options={farms} onChange={(v) => { setFarmId(v); setBatchId(""); }} error={errors.farmId} required />
            <SelectField label="Flock Batch" value={batchId} options={batches} onChange={setBatchId} error={errors.batchId} required placeholder={farmId ? "Select batch…" : "Select farm first"} />
            <FormField label="Collection Date" required value={date} onChangeText={setDate} error={errors.date} keyboardType="numeric" placeholder="YYYY-MM-DD" />
          </View>

          {/* ── Egg Count ── */}
          <View style={styles.card}>
            <Text style={styles.cardLabel}>EGG COUNT</Text>

            <FormField
              label="Good Eggs (Marketable)"
              required
              value={goodEggs}
              onChangeText={(v) => { setGoodEggs(v); setErrors((e) => ({ ...e, goodEggs: "" })); }}
              error={errors.goodEggs}
              keyboardType="numeric"
              placeholder="e.g. 4200"
            />

            <Text style={styles.rejectLabel}>Reject / Non-Marketable Eggs</Text>
            <Text style={styles.rejectHint}>These are still counted as eggs laid — broken or leaking eggs included.</Text>

            <View style={styles.row}>
              <View style={styles.quarter}><FormField label="Cracked" value={crackedEggs} onChangeText={setCrackedEggs} keyboardType="numeric" placeholder="0" /></View>
              <View style={styles.quarter}><FormField label="Dirty" value={dirtyEggs} onChangeText={setDirtyEggs} keyboardType="numeric" placeholder="0" /></View>
              <View style={styles.quarter}><FormField label="Broken" value={brokenEggs} onChangeText={setBrokenEggs} keyboardType="numeric" placeholder="0" /></View>
              <View style={styles.quarter}><FormField label="Rejected" value={rejectedEggs} onChangeText={setRejectedEggs} keyboardType="numeric" placeholder="0" /></View>
            </View>

            {/* Live total summary */}
            {totalCollected > 0 && (
              <View style={styles.totalBox}>
                <View style={styles.totalRow}>
                  <MaterialCommunityIcons name="egg" size={15} color="#16a34a" />
                  <Text style={styles.totalKey}>Good (sellable)</Text>
                  <Text style={[styles.totalVal, { color: "#16a34a" }]}>{good.toLocaleString()}</Text>
                </View>
                {totalRejects > 0 && (
                  <View style={styles.totalRow}>
                    <MaterialCommunityIcons name="egg-off-outline" size={15} color="#d97706" />
                    <Text style={styles.totalKey}>Rejects (cracked/broken/dirty)</Text>
                    <Text style={[styles.totalVal, { color: "#d97706" }]}>{totalRejects.toLocaleString()}</Text>
                  </View>
                )}
                <View style={[styles.totalRow, styles.totalGrandRow]}>
                  <MaterialCommunityIcons name="sigma" size={15} color={colors.brand} />
                  <Text style={[styles.totalKey, styles.totalGrandKey]}>Total Eggs Collected</Text>
                  <Text style={[styles.totalVal, styles.totalGrandVal]}>{totalCollected.toLocaleString()}</Text>
                </View>
              </View>
            )}
          </View>

          {/* ── Notes ── */}
          <View style={styles.card}>
            <Text style={styles.cardLabel}>NOTES</Text>
            <FormField
              label="Additional Notes"
              value={notes}
              onChangeText={setNotes}
              multiline
              numberOfLines={3}
              style={{ minHeight: 80, textAlignVertical: "top" } as any}
              placeholder="e.g. birds stressed, unusual mortality, collection delay…"
            />
          </View>

          {/* ── Inventory Link ── */}
          <View style={styles.card}>
            <Text style={styles.cardLabel}>ADD TO STOCK (OPTIONAL)</Text>
            <Text style={styles.sectionHint}>Choose a warehouse and the matching inventory item to automatically update stock with the good eggs collected today.</Text>
            <SelectField label="Warehouse" value={warehouseId} options={warehouses} onChange={setWarehouseId} placeholder="No warehouse selected" />
            <SelectField label="Inventory Item (Eggs)" value={eggProductId} options={products} onChange={setEggProductId} placeholder="No inventory item selected" />
          </View>

        </ScrollView>

        {/* ── Sticky footer ── always visible */}
        <View style={styles.footer}>
          <TouchableOpacity style={styles.cancelBtn} onPress={() => navigation.goBack()} activeOpacity={0.7}>
            <Text style={styles.cancelText}>Cancel</Text>
          </TouchableOpacity>
          <View style={styles.saveBtn}>
            <Button label="Save Collection" loading={loading} onPress={handleSave} size="lg" />
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:  { flex: 1, backgroundColor: colors.bg },
  fill:  { flex: 1 },
  scroll: { padding: spacing.xl, gap: spacing.lg, paddingBottom: spacing.lg },

  pageHeader: { flexDirection: "row", alignItems: "center", gap: spacing.md, marginBottom: spacing.xs },
  pageIconWrap: {
    width: 48, height: 48, borderRadius: 12,
    backgroundColor: colors.brandLight,
    borderWidth: 1, borderColor: colors.brandMid,
    alignItems: "center", justifyContent: "center",
    ...shadow.sm,
  },
  title: { fontSize: font.size.xl, fontFamily: font.family.extrabold, color: colors.ink },
  sub:   { fontSize: font.size.sm, color: colors.inkMid, fontFamily: font.family.regular },

  card: {
    backgroundColor: colors.bgCard,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.md,
    ...shadow.sm,
  },
  cardLabel: {
    fontSize: font.size.xs,
    fontFamily: font.family.bold,
    color: colors.inkLight,
    letterSpacing: 1.2,
    textTransform: "uppercase",
  },

  rejectLabel: {
    fontSize: font.size.sm,
    fontFamily: font.family.semibold,
    color: colors.inkMid,
    marginTop: spacing.xs,
  },
  rejectHint: {
    fontSize: font.size.xs,
    color: colors.inkLight,
    fontFamily: font.family.regular,
    marginTop: -spacing.sm + 2,
    lineHeight: 16,
  },

  row:     { flexDirection: "row", gap: spacing.sm },
  quarter: { flex: 1 },

  totalBox: {
    backgroundColor: colors.bg,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  totalRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  totalKey: { flex: 1, fontSize: font.size.sm, color: colors.inkMid, fontFamily: font.family.medium },
  totalVal: { fontSize: font.size.sm, fontFamily: font.family.bold },
  totalGrandRow: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.xs,
    marginTop: spacing.xs,
  },
  totalGrandKey: { color: colors.ink, fontFamily: font.family.bold },
  totalGrandVal: { color: colors.brand, fontSize: font.size.md, fontFamily: font.family.extrabold },

  sectionHint: {
    fontSize: font.size.xs,
    color: colors.inkLight,
    fontFamily: font.family.regular,
    lineHeight: 16,
    marginTop: -spacing.xs,
  },

  footer: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    padding: spacing.xl,
    paddingTop: spacing.md,
    backgroundColor: colors.bg,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  cancelBtn: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md + 2,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bgCard,
  },
  cancelText: {
    fontSize: font.size.md,
    fontFamily: font.family.semibold,
    color: colors.inkMid,
  },
  saveBtn: { flex: 1 },
});
