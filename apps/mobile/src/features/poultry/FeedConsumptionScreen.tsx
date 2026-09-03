import { useEffect, useMemo, useState } from "react";
import { Alert, StyleSheet, Text, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { ScreenWrapper } from "../../components/ScreenWrapper";
import { FormCard } from "../../components/FormCard";
import { FormFooter } from "../../components/FormFooter";
import { FormField } from "../../components/FormField";
import { DateField } from "../../components/DateField";
import { SelectField, SelectOption } from "../../components/SelectField";
import { useSubmit } from "../../hooks/useSubmit";
import { useLookup } from "../../hooks/useLookup";
import { fetchFlockBatches, fetchFarms, fetchWarehouses, fetchPoultryOptions, pensForBatch } from "../../api/endpoints";
import { useAuth } from "../../auth/AuthContext";
import { colors, font, spacing } from "../../constants/theme";

export function FeedConsumptionScreen() {
  const { user } = useAuth();
  const navigation = useNavigation<any>();
  const [farmId, setFarmId]           = useState("");
  const [batchId, setBatchId]         = useState("");
  const [date, setDate]               = useState(new Date().toISOString().split("T")[0]);
  const [quantityKg, setQuantityKg]   = useState("");
  const [gramsPerBird, setGramsPerBird] = useState("");
  const [costAmount, setCostAmount]   = useState("");
  const [notes, setNotes]             = useState("");
  const [warehouseId, setWarehouseId] = useState("");
  const [feedProductId, setFeedProductId] = useState("");
  const [errors, setErrors]           = useState<Record<string, string>>({});

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

  // Auto-select batch when the farm has only one active batch
  useEffect(() => {
    if (batches.length === 1 && !batchId) {
      setBatchId(batches[0].value);
    }
  }, [batches]);

  const selectedBatch = useMemo(
    () => (rawBatches ?? []).find((b: any) => b.id === batchId),
    [rawBatches, batchId]
  );
  const birdCount: number = selectedBatch
    ? (Number(selectedBatch.currentBirdCount ?? selectedBatch.birdCount ?? selectedBatch.openingBirds) || 0)
    : 0;

  const [penId, setPenId] = useState("");
  const { data: opts } = useLookup("poultry-options", fetchPoultryOptions);
  const pens: SelectOption[] = useMemo(
    () => pensForBatch(opts?.data, batchId).map((p) => ({ label: `Pen ${p.penNumber} — ${p.name}`, value: p.id })),
    [opts, batchId]
  );

  // The feed comes out of the flock's own farm's Feed Store — scope the picker
  // to that farm and auto-select it, instead of listing every warehouse.
  const { data: rawWarehouses } = useLookup("warehouses", async () => { const r = await fetchWarehouses(); return (r.data as any[]) ?? []; });
  const feedStores: SelectOption[] = useMemo(() => {
    const scoped = (opts?.data.feedWarehouses ?? []).filter((w) => !farmId || w.farmId === farmId);
    if (scoped.length) return scoped.map((w) => ({ label: w.code ? `${w.name} (${w.code})` : w.name, value: w.id }));
    return (rawWarehouses ?? []).map((w: any) => ({ label: w.name, value: w.id }));
  }, [opts, farmId, rawWarehouses]);
  const warehouses = feedStores;
  useEffect(() => {
    setWarehouseId((prev) => (feedStores.find((w) => w.value === prev) ? prev : (feedStores[0]?.value ?? "")));
  }, [feedStores]);

  // Finished feed only — poultry never consumes raw ingredients. The poultry
  // options endpoint already narrows feedProducts to finished feed.
  const products: SelectOption[] = useMemo(
    () => (opts?.data.feedProducts ?? []).map((p) => ({ label: p.sku ? `${p.sku} — ${p.name}` : p.name, value: p.id })),
    [opts]
  );

  // When g/bird is entered and bird count is known, auto-calculate total kg
  function handleGramsPerBirdChange(v: string) {
    setGramsPerBird(v);
    const g = Number(v);
    if (g > 0 && birdCount > 0) {
      const total = (g * birdCount) / 1000;
      setQuantityKg(Number.isInteger(total) ? String(total) : total.toFixed(2));
      setErrors((e) => ({ ...e, quantityKg: "" }));
    }
  }

  // Re-calculate if birdCount loads after g/bird was entered
  useEffect(() => {
    const g = Number(gramsPerBird);
    if (g > 0 && birdCount > 0) {
      const total = (g * birdCount) / 1000;
      setQuantityKg(Number.isInteger(total) ? String(total) : total.toFixed(2));
    }
  }, [birdCount]);

  function validate() {
    const e: Record<string, string> = {};
    if (!farmId)    e.farmId    = "Select farm";
    if (!batchId)   e.batchId   = "Select batch";
    if (!date)      e.date      = "Date required";
    if (!quantityKg || isNaN(Number(quantityKg)) || Number(quantityKg) <= 0) e.quantityKg = "Enter quantity";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  const { submit, loading } = useSubmit({
    module: "poultry_feed",
    endpoint: "/poultry/feed-consumption-records",
    // Mobile parity audit (2026-08-17): FeedConsumptionRecord now accepts idempotencyKey.
    sendIdempotencyKeyInBody: true,
    // M-BUG follow-up (2026-08-13): consumeInventoryTx now returns a
    // warning when the warehouse/product combo has no inventory item set
    // up (stock wasn't actually deducted), but nothing displayed it — the
    // exact "saved successfully" silence the fix was meant to close, just
    // moved from the backend to here.
    onSuccess: (queued, response) => {
      const warning = !queued ? (response as { warning?: string } | undefined)?.warning : undefined;
      Alert.alert(
        queued ? "Saved Offline" : warning ? "Saved — please check" : "Saved",
        queued
          ? "Your feed consumption record was saved on this device and will sync automatically once you're back online."
          : warning ?? "Feed consumption recorded.",
        [{ text: "OK", onPress: () => navigation.goBack() }]
      );
    }
  });

  async function handleSubmit() {
    if (!validate()) return;
    await submit({
      flockBatchId:  batchId,
      recordDate:    date,
      quantityKg:    Number(quantityKg),
      costAmount:    costAmount ? Number(costAmount) : undefined,
      notes:         notes || undefined,
      warehouseId:   warehouseId   || undefined,
      feedProductId: feedProductId || undefined,
      penId:         penId         || undefined,
    });
  }

  const kg   = Number(quantityKg)  || 0;
  const cost = Number(costAmount)  || 0;
  const showAnalysis = kg > 0;

  return (
    <ScreenWrapper footer={<FormFooter saveLabel="Save Feed Record" onSave={handleSubmit} loading={loading} />}>
      <View style={styles.pageHeader}>
        <View style={styles.pageIconWrap}>
          <MaterialCommunityIcons name="barley" size={22} color={colors.brand} />
        </View>
        <View>
          <Text style={styles.title}>Feed Consumption</Text>
          <Text style={styles.sub}>Record feed given to flock</Text>
        </View>
      </View>

      <FormCard label="FLOCK / BATCH">
        <SelectField
          label="Farm"
          value={farmId}
          options={farms}
          onChange={(v) => { setFarmId(v); setBatchId(""); setGramsPerBird(""); setQuantityKg(""); }}
          error={errors.farmId}
          required
        />
        <SelectField
          label="Flock Batch"
          value={batchId}
          options={batches}
          onChange={(v) => { setBatchId(v); setPenId(""); }}
          error={errors.batchId}
          required
          placeholder={farmId ? (batches.length === 0 ? "No active batches" : "Select batch…") : "Select farm first"}
        />
        {pens.length > 0 && <SelectField label="Pen (optional)" value={penId} options={pens} onChange={setPenId} placeholder="All pens" />}
        {/* Bird count chip — shows once a batch with known population is selected */}
        {birdCount > 0 && (
          <View style={styles.birdChip}>
            <MaterialCommunityIcons name="bird" size={13} color={colors.brand} />
            <Text style={styles.birdChipText}>{birdCount.toLocaleString()} birds in this batch</Text>
          </View>
        )}
        <DateField label="Date" required value={date} onChangeText={setDate} error={errors.date} />
      </FormCard>

      <FormCard label="FEED DATA">
        {/* g/bird shortcut — only shown when bird count is known */}
        {birdCount > 0 && (
          <View style={styles.rateWrap}>
            <MaterialCommunityIcons name="calculator-variant" size={14} color={colors.brand} />
            <Text style={styles.rateLabel}>Quick entry: type grams per bird → total kg fills automatically</Text>
          </View>
        )}

        <View style={styles.row}>
          {birdCount > 0 && (
            <View style={styles.third}>
              <FormField
                label="Rate (g/bird)"
                value={gramsPerBird}
                onChangeText={handleGramsPerBirdChange}
                keyboardType="decimal-pad"
                placeholder="e.g. 120"
              />
            </View>
          )}
          <View style={birdCount > 0 ? styles.third : styles.half}>
            <FormField
              label="Quantity (kg)"
              required
              value={quantityKg}
              onChangeText={(v) => { setQuantityKg(v); setErrors((e) => ({ ...e, quantityKg: "" })); }}
              error={errors.quantityKg}
              keyboardType="decimal-pad"
              placeholder="e.g. 250"
            />
          </View>
          <View style={birdCount > 0 ? styles.third : styles.half}>
            <FormField
              label="Total Cost (GHS)"
              value={costAmount}
              onChangeText={setCostAmount}
              keyboardType="decimal-pad"
              placeholder="Optional"
            />
          </View>
        </View>

        {/* Live cost & feed analysis */}
        {showAnalysis && (
          <View style={styles.analysisBox}>
            <View style={styles.analysisRow}>
              <MaterialCommunityIcons name="scale" size={14} color={colors.inkMid} />
              <Text style={styles.analysisKey}>Total feed</Text>
              <Text style={styles.analysisVal}>{kg.toLocaleString()} kg</Text>
            </View>
            {birdCount > 0 && (
              <View style={styles.analysisRow}>
                <MaterialCommunityIcons name="barley" size={14} color="#10B981" />
                <Text style={styles.analysisKey}>Feed per bird</Text>
                <Text style={[styles.analysisVal, { color: "#10B981" }]}>
                  {((kg / birdCount) * 1000).toFixed(0)} g &nbsp;({(kg / birdCount).toFixed(3)} kg)
                </Text>
              </View>
            )}
            {cost > 0 && (
              <>
                <View style={styles.analysisDivider} />
                <View style={styles.analysisRow}>
                  <MaterialCommunityIcons name="currency-usd" size={14} color="#D97706" />
                  <Text style={styles.analysisKey}>Cost per kg</Text>
                  <Text style={[styles.analysisVal, { color: "#D97706" }]}>GHS {(cost / kg).toFixed(2)}</Text>
                </View>
                {birdCount > 0 && (
                  <View style={styles.analysisRow}>
                    <MaterialCommunityIcons name="bird" size={14} color={colors.brand} />
                    <Text style={styles.analysisKey}>Cost per bird</Text>
                    <Text style={[styles.analysisVal, { color: colors.brandDark }]}>GHS {(cost / birdCount).toFixed(2)}</Text>
                  </View>
                )}
                <View style={[styles.analysisRow, styles.analysisTotalRow]}>
                  <MaterialCommunityIcons name="sigma" size={14} color={colors.brand} />
                  <Text style={[styles.analysisKey, styles.analysisTotalKey]}>Total feed cost</Text>
                  <Text style={[styles.analysisVal, styles.analysisTotalVal]}>GHS {cost.toLocaleString()}</Text>
                </View>
              </>
            )}
          </View>
        )}
      </FormCard>

      <FormCard label="NOTES">
        <FormField
          label="Notes"
          value={notes}
          onChangeText={setNotes}
          multiline
          numberOfLines={2}
          style={{ minHeight: 70, textAlignVertical: "top" } as any}
          placeholder="Optional notes…"
        />
      </FormCard>

      <FormCard label="DEDUCT FROM STOCK (OPTIONAL)">
        <SelectField label="Warehouse" value={warehouseId} options={warehouses} onChange={setWarehouseId} placeholder="No warehouse selected" />
        <SelectField label="Feed Product" value={feedProductId} options={products} onChange={setFeedProductId} placeholder="No product selected" />
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

  birdChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    alignSelf: "flex-start",
    backgroundColor: colors.brandLight,
    borderWidth: 1,
    borderColor: colors.brandMid,
    paddingHorizontal: spacing.md,
    paddingVertical: 4,
    borderRadius: 20,
  },
  birdChipText: { fontSize: font.size.xs, color: colors.brandDark, fontFamily: font.family.bold },

  rateWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: colors.brandLight,
    borderRadius: 8,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderWidth: 1,
    borderColor: colors.brandMid,
  },
  rateLabel: { fontSize: font.size.xs, color: colors.brandDark, fontFamily: font.family.medium, flex: 1 },

  row:   { flexDirection: "row", gap: spacing.md },
  half:  { flex: 1 },
  third: { flex: 1 },

  analysisBox: {
    backgroundColor: colors.bg,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  analysisRow:     { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  analysisKey:     { flex: 1, fontSize: font.size.sm, color: colors.inkMid, fontFamily: font.family.medium },
  analysisVal:     { fontSize: font.size.sm, fontFamily: font.family.bold, color: colors.ink },
  analysisDivider: { height: 1, backgroundColor: colors.border, marginVertical: spacing.xs },
  analysisTotalRow: {
    borderTopWidth: 1, borderTopColor: colors.border,
    paddingTop: spacing.xs, marginTop: spacing.xs,
  },
  analysisTotalKey: { color: colors.ink, fontFamily: font.family.bold },
  analysisTotalVal: { color: colors.brandDark, fontSize: font.size.md, fontFamily: font.family.extrabold },
});
