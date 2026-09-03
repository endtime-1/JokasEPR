import { useEffect, useLayoutEffect, useMemo, useState } from "react";
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { FormField } from "../../components/FormField";
import { DateField } from "../../components/DateField";
import { SelectField, SelectOption } from "../../components/SelectField";
import { Button } from "../../components/Button";
import { SyncBanner } from "../../components/SyncBanner";
import { useSubmit } from "../../hooks/useSubmit";
import { useLookup } from "../../hooks/useLookup";
import { fetchFlockBatches, fetchFarms, fetchWarehouses, fetchProducts, fetchPoultryOptions, pensForBatch, poultryStoreFor } from "../../api/endpoints";
import { useAuth } from "../../auth/AuthContext";
import { colors, font, radius, shadow, spacing } from "../../constants/theme";

// Eggs are physically collected and counted in crates on the farm, not
// individual pieces — 1 crate = 30 eggs.
const EGGS_PER_CRATE = 30;

export function EggCollectionScreen() {
  const { user } = useAuth();
  const navigation = useNavigation<any>();

  const [farmId, setFarmId]           = useState("");
  const [batchId, setBatchId]         = useState("");
  const [date, setDate]               = useState(new Date().toISOString().split("T")[0]);
  const [crates, setCrates]           = useState("");
  const [goodEggs, setGoodEggs]       = useState("");
  const [crackedEggs, setCrackedEggs] = useState("0");
  const [dirtyEggs, setDirtyEggs]     = useState("0");
  const [brokenEggs, setBrokenEggs]   = useState("0");
  const [rejectedEggs, setRejectedEggs] = useState("0");
  const [notes, setNotes]             = useState("");
  const [warehouseId, setWarehouseId] = useState("");
  const [eggProductId, setEggProductId] = useState("");
  const [secondsProductId, setSecondsProductId] = useState("");
  const [penId, setPenId]             = useState("");
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
    // (2026-08-28) Matches web's batch picker, which applies no status
    // filter — see DailyPoultryScreen's own note on this same change.
    () => (rawBatches ?? []).map((b: any) => ({ label: b.code ?? b.batchCode ?? b.name, value: b.id })),
    [rawBatches]
  );

  const { data: opts } = useLookup("poultry-options", fetchPoultryOptions);
  const selectedBatch = useMemo(() => (rawBatches ?? []).find((b: any) => b.id === batchId), [rawBatches, batchId]);
  const pens: SelectOption[] = useMemo(
    () => pensForBatch(opts?.data, batchId).map((p) => ({ label: `Pen ${p.penNumber} — ${p.name}`, value: p.id })),
    [opts, batchId]
  );

  // Eggs go into the flock's own farm's Egg Store — scope the picker to that
  // farm and auto-select the right store, rather than listing every warehouse.
  const { data: rawWarehouses } = useLookup("warehouses", async () => { const r = await fetchWarehouses(); return (r.data as any[]) ?? []; });
  const warehouses: SelectOption[] = useMemo(() => {
    const s = (opts?.data.warehouses ?? []).filter((w) => farmId && w.farmId === farmId);
    return s.length ? s.map((w) => ({ label: w.code ? `${w.name} (${w.code})` : w.name, value: w.id })) : (rawWarehouses ?? []).map((w: any) => ({ label: w.name, value: w.id }));
  }, [opts, farmId, rawWarehouses]);
  useEffect(() => {
    const auto = poultryStoreFor(opts?.data, "eggs", farmId);
    setWarehouseId((prev) => auto || (warehouses.find((w) => w.value === prev) ? prev : (warehouses[0]?.value ?? "")));
  }, [opts, farmId, warehouses]);

  const { data: rawProducts } = useLookup("products", async () => { const r = await fetchProducts(); return (r.data as any[]) ?? []; });
  const products: SelectOption[] = useMemo(
    () => (rawProducts ?? []).map((p: any) => ({ label: `${p.sku} — ${p.name}`, value: p.id })),
    [rawProducts]
  );

  // ── Crates → pieces conversion ───────────────────────────────────────
  // Crates is a data-entry convenience only — Good Eggs (pieces) stays the
  // real field submitted to the backend, unchanged from before. Typing a
  // crate count fills Good Eggs for you; Good Eggs itself is still directly
  // editable afterward for a partial crate or a manual adjustment.
  function handleCratesChange(v: string) {
    setCrates(v);
    const n = Math.max(0, Number(v) || 0);
    setGoodEggs(v ? String(n * EGGS_PER_CRATE) : "");
    setErrors((e) => ({ ...e, goodEggs: "" }));
  }

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
    // Mobile parity audit (2026-08-17): EggProductionRecord now accepts idempotencyKey.
    sendIdempotencyKeyInBody: true,
    // M-BUG follow-up (2026-08-13): createEggs now returns a warning for a
    // young-flock age check and for cracked/dirty eggs recorded with no
    // "seconds" product set, but nothing displayed either — same silent
    // gap the fix was meant to close, just moved here.
    onSuccess: (queued, response) => {
      const warning = !queued ? (response as { warning?: string } | undefined)?.warning : undefined;
      Alert.alert(
        queued ? "Saved Offline" : warning ? "Saved — please check" : "Saved",
        queued
          ? "Your egg collection record was saved on this device and will sync automatically once you're back online."
          : warning ?? "Egg collection recorded.",
        [{ text: "OK", onPress: () => navigation.goBack() }]
      );
    }
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
      secondsProductId: secondsProductId || undefined,
      penId:         penId        || undefined,
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
            <SelectField label="Farm" value={farmId} options={farms} onChange={(v) => { setFarmId(v); setBatchId(""); setPenId(""); }} error={errors.farmId} required />
            <SelectField label="Flock Batch" value={batchId} options={batches} onChange={(v) => { setBatchId(v); setPenId(""); }} error={errors.batchId} required placeholder={farmId ? "Select batch…" : "Select farm first"} />
            {pens.length > 0 && <SelectField label="Pen (optional)" value={penId} options={pens} onChange={setPenId} placeholder="All pens" />}
            <DateField label="Collection Date" required value={date} onChangeText={setDate} error={errors.date} />
          </View>

          {/* ── Egg Count ── */}
          <View style={styles.card}>
            <Text style={styles.cardLabel}>EGG COUNT</Text>

            <FormField
              label={`Crates Collected (1 crate = ${EGGS_PER_CRATE} eggs)`}
              value={crates}
              onChangeText={handleCratesChange}
              keyboardType="numeric"
              placeholder="e.g. 140"
            />

            <FormField
              label="Good Eggs (Marketable)"
              required
              value={goodEggs}
              onChangeText={(v) => { setGoodEggs(v); setErrors((e) => ({ ...e, goodEggs: "" })); }}
              error={errors.goodEggs}
              keyboardType="numeric"
              placeholder="e.g. 4200, or fill in Crates above"
            />
            {!!crates && <Text style={styles.rejectHint}>{crates} crate{Number(crates) === 1 ? "" : "s"} × {EGGS_PER_CRATE} = {(Math.max(0, Number(crates) || 0) * EGGS_PER_CRATE).toLocaleString()} eggs. Adjust Good Eggs above for a partial crate.</Text>}

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
            {totalRejects > 0 && (
              <SelectField
                label="Seconds Item (Cracked/Dirty, optional)"
                value={secondsProductId}
                options={products}
                onChange={setSecondsProductId}
                placeholder="Not added to stock"
              />
            )}
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
  totalGrandVal: { color: colors.brandDark, fontSize: font.size.md, fontFamily: font.family.extrabold },

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
