import { useEffect, useMemo, useState } from "react";
import { Alert, Modal, StyleSheet, Text, TouchableOpacity, View } from "react-native";
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
import { fetchFlockBatches, fetchFarms, fetchPoultryOptions, fetchWarehouses, fetchFeedProducts, fetchProducts, fetchDailyPoultryRecords, pensForBatch, DailyPoultryRecordRow } from "../../api/endpoints";
import { apiFetch } from "../../api/client";
import { useAuth } from "../../auth/AuthContext";
import { colors, font, radius, spacing } from "../../constants/theme";

type Form = {
  farmId: string;
  flockBatchId: string;
  recordDate: string;
  openingBirdCount: string;
  mortalityCount: string;
  culledCount: string;
  feedConsumedKg: string;
  totalEggs: string;
  notes: string;
  penId: string;
  feedWarehouseId: string;
  feedProductId: string;
  eggWarehouseId: string;
  eggProductId: string;
};

const EMPTY: Form = {
  farmId: "", flockBatchId: "", recordDate: new Date().toISOString().split("T")[0],
  openingBirdCount: "", mortalityCount: "0", culledCount: "0", feedConsumedKg: "0", totalEggs: "0", notes: "", penId: "",
  feedWarehouseId: "", feedProductId: "", eggWarehouseId: "", eggProductId: ""
};

type Err = Partial<Record<keyof Form, string>>;

// Eggs are physically collected and counted in crates on the farm, not
// individual pieces — 1 crate = 30 eggs. Mirrors the Egg Collection screen's
// own constant.
const EGGS_PER_CRATE = 30;

export function DailyPoultryScreen() {
  const { user } = useAuth();
  const navigation = useNavigation<any>();
  const [form, setForm] = useState<Form>(EMPTY);
  const [errors, setErrors] = useState<Err>({});
  const [crates, setCrates] = useState("");

  // (2026-08-28) useLookup's `error` was being discarded here — a failed
  // fetch (permission issue, network error, etc.) just left the dropdown
  // silently empty with nothing to explain why, indistinguishable from
  // "there's genuinely nothing to pick." Wired into SelectField below so a
  // real failure shows a real message instead of a mysterious blank list.
  const { data: rawFarms, error: farmsError, loading: farmsLoading } = useLookup("farms", async () => { const r = await fetchFarms(); return (r.data as any[]) ?? []; });
  const farms: SelectOption[] = useMemo(() => {
    const all = rawFarms ?? [];
    const assigned = (user?.hasGlobalAccess || !user?.farmIds?.length) ? all : all.filter((f: any) => user?.farmIds?.includes(f.id));
    return assigned.map((f: any) => ({ label: f.name, value: f.id }));
  }, [rawFarms, user]);

  const { data: rawBatches, error: batchesError, loading: batchesLoading } = useLookup(
    `flockBatches:${form.farmId}`,
    async () => { const r = await fetchFlockBatches(form.farmId); return (r.data as any[]) ?? []; },
    !form.farmId
  );
  // (2026-08-28) Was ACTIVE-only, silently hiding every batch in any other
  // status (PLANNED, TRANSFERRED, etc.) with no explanation — showed as an
  // unexplained "No options available" for a farm whose batch genuinely
  // existed and was visible/usable on web. Web's own batch picker applies
  // no status filter at all and lets the backend be the authority on
  // whether a record can be saved against a given batch; matching that
  // here instead of a stricter, inconsistent client-side guess.
  const batches: SelectOption[] = useMemo(
    () => (rawBatches ?? []).map((b: any) => ({ label: `${b.code} — ${b.name}`, value: b.id })),
    [rawBatches]
  );

  const { data: opts } = useLookup("poultry-options", fetchPoultryOptions);
  const selectedBatch = useMemo(() => (rawBatches ?? []).find((b: any) => b.id === form.flockBatchId), [rawBatches, form.flockBatchId]);
  const pens: SelectOption[] = useMemo(
    () => pensForBatch(opts?.data, form.flockBatchId).map((p) => ({ label: `Pen ${p.penNumber} — ${p.name}`, value: p.id })),
    [opts, form.flockBatchId]
  );

  // Optional — matching the dedicated Feed Consumption / Egg Collection
  // screens' own "deduct from stock (optional)" convention: the count is
  // recorded either way, these just also move real stock when given.
  const { data: rawWarehouses, error: warehousesError, loading: warehousesLoading } = useLookup("warehouses", async () => { const r = await fetchWarehouses(); return (r.data as any[]) ?? []; });
  const warehouses: SelectOption[] = useMemo(() => (rawWarehouses ?? []).map((w: any) => ({ label: w.name, value: w.id })), [rawWarehouses]);
  const { data: rawFeedProducts } = useLookup("feedProducts", async () => { const r = await fetchFeedProducts(); return (r.data as any[]) ?? []; });
  const feedProducts: SelectOption[] = useMemo(() => (rawFeedProducts ?? []).map((p: any) => ({ label: `${p.sku} — ${p.name}`, value: p.id })), [rawFeedProducts]);
  const { data: rawEggProducts } = useLookup("products", async () => { const r = await fetchProducts(); return (r.data as any[]) ?? []; });
  const eggProducts: SelectOption[] = useMemo(() => (rawEggProducts ?? []).map((p: any) => ({ label: `${p.sku} — ${p.name}`, value: p.id })), [rawEggProducts]);

  // (2026-08-28) This screen was create-only — no way to see a record you'd
  // already entered without going back to web. Recent Records below lets
  // you tap a past entry to view it, for the selected batch.
  const { data: recentRecords, loading: recordsLoading, error: recordsError } = useLookup(
    `dailyRecords:${form.flockBatchId}`,
    async () => { const r = await fetchDailyPoultryRecords(form.flockBatchId); return r.data ?? []; },
    !form.flockBatchId
  );
  const [viewRecord, setViewRecord] = useState<DailyPoultryRecordRow | null>(null);

  const set = (k: keyof Form) => (v: string) => {
    setForm((f) => ({ ...f, [k]: v }));
    setErrors((e) => ({ ...e, [k]: undefined }));
  };

  // Crates is a data-entry convenience only — Total Eggs (pieces) stays the
  // real field submitted to the backend, unchanged. Total Eggs itself is
  // still directly editable afterward for a partial crate or an adjustment.
  function handleCratesChange(v: string) {
    setCrates(v);
    const n = Math.max(0, Number(v) || 0);
    set("totalEggs")(v ? String(n * EGGS_PER_CRATE) : "");
  }

  useEffect(() => {
    if (!form.flockBatchId || !form.recordDate) return;
    let cancelled = false;
    const penQuery = form.penId ? `&penId=${encodeURIComponent(form.penId)}` : "";
    apiFetch<{ data: { openingBirdCount: number; mortalityCount?: number; culledCount?: number; feedConsumedKg?: number; totalEggs?: number; notes?: string; source: string } }>(
      `/poultry/daily-records/prefill?flockBatchId=${encodeURIComponent(form.flockBatchId)}&date=${encodeURIComponent(form.recordDate)}${penQuery}`
    ).then((res) => {
      if (cancelled) return;
      const data = res?.data;
      if (data?.openingBirdCount == null) return;
      // "existing_today" means this batch+pen+date was already saved —
      // prefill everything, not just Opening Count, so reopening the screen
      // to add one more field doesn't silently zero out the rest and trip
      // the "can't be reduced" guard on submit.
      if (data.source === "existing_today") {
        setForm((f) => ({
          ...f,
          openingBirdCount: String(data.openingBirdCount),
          mortalityCount: String(data.mortalityCount ?? 0),
          culledCount: String(data.culledCount ?? 0),
          feedConsumedKg: String(data.feedConsumedKg ?? 0),
          totalEggs: String(data.totalEggs ?? 0),
          notes: data.notes ?? f.notes,
        }));
      } else {
        setForm((f) => ({ ...f, openingBirdCount: String(data.openingBirdCount) }));
      }
    }).catch(() => undefined);
    return () => { cancelled = true; };
  }, [form.flockBatchId, form.recordDate, form.penId]);

  function validate() {
    const e: Err = {};
    if (!form.farmId) e.farmId = "Select a farm";
    if (!form.flockBatchId) e.flockBatchId = "Select a flock batch";
    if (!form.recordDate) e.recordDate = "Date is required";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  const { submit, loading } = useSubmit({
    module: "poultry_daily",
    endpoint: "/poultry/daily-records",
    onSuccess: (queued) => {
      Alert.alert(
        queued ? "Saved Offline" : "Saved",
        queued
          ? "Your daily record was saved on this device and will sync automatically once you're back online."
          : "Daily record saved successfully.",
        [{ text: "OK", onPress: () => navigation.goBack() }]
      );
    }
  });

  async function handleSubmit() {
    if (!validate()) return;
    await submit({
      flockBatchId: form.flockBatchId,
      recordDate: form.recordDate,
      openingBirdCount: form.openingBirdCount ? Number(form.openingBirdCount) : undefined,
      mortalityCount: Number(form.mortalityCount) || 0,
      culledCount: Number(form.culledCount) || 0,
      feedConsumedKg: Number(form.feedConsumedKg) || 0,
      totalEggs: Number(form.totalEggs) || 0,
      notes: form.notes || undefined,
      penId: form.penId || undefined,
      feedWarehouseId: form.feedWarehouseId || undefined,
      feedProductId: form.feedProductId || undefined,
      eggWarehouseId: form.eggWarehouseId || undefined,
      eggProductId: form.eggProductId || undefined
    });
  }

  return (
    <ScreenWrapper footer={<FormFooter saveLabel="Save Record" onSave={handleSubmit} loading={loading} />}>
      <View style={styles.pageHeader}>
        <View style={styles.pageIconWrap}>
          <MaterialCommunityIcons name="clipboard-list" size={22} color={colors.brand} />
        </View>
        <View>
          <Text style={styles.title}>Daily Poultry Record</Text>
          <Text style={styles.sub}>Record daily population and performance</Text>
        </View>
      </View>

      <FormCard label="FLOCK / BATCH">
        <SelectField label="Farm" value={form.farmId} options={farms} onChange={set("farmId")} error={errors.farmId ?? farmsError ?? undefined} loading={farmsLoading} required placeholder="Select farm…" />
        <SelectField label="Flock Batch" value={form.flockBatchId} options={batches} onChange={set("flockBatchId")} error={errors.flockBatchId ?? batchesError ?? undefined} loading={batchesLoading} required placeholder={form.farmId ? "Select batch…" : "Select farm first"} />
        {pens.length > 0 && <SelectField label="Pen (optional)" value={form.penId} options={pens} onChange={set("penId")} placeholder="All pens" />}
        <DateField label="Record Date" required value={form.recordDate} onChangeText={set("recordDate")} error={errors.recordDate} />
      </FormCard>

      {form.flockBatchId && (
        <FormCard label="RECENT RECORDS">
          {recordsError ? (
            <Text style={styles.recordsMsg}>{recordsError}</Text>
          ) : recordsLoading && !recentRecords ? (
            <Text style={styles.recordsMsg}>Loading…</Text>
          ) : !recentRecords || recentRecords.length === 0 ? (
            <Text style={styles.recordsMsg}>No records yet for this batch.</Text>
          ) : (
            recentRecords.map((r, idx) => (
              <TouchableOpacity
                key={r.id}
                style={[styles.recordRow, idx > 0 && styles.recordRowDivider]}
                onPress={() => setViewRecord(r)}
                activeOpacity={0.7}
              >
                <View style={styles.recordRowText}>
                  <Text style={styles.recordDate}>{new Date(r.recordDate).toLocaleDateString()}</Text>
                  <Text style={styles.recordStats}>
                    {r.openingBirdCount != null ? `${r.openingBirdCount.toLocaleString()} birds` : "— birds"}
                    {r.mortalityCount > 0 ? ` · ${r.mortalityCount} dead` : ""}
                    {r.totalEggs > 0 ? ` · ${r.totalEggs} eggs` : ""}
                  </Text>
                </View>
                <MaterialCommunityIcons name="chevron-right" size={20} color={colors.inkLight} />
              </TouchableOpacity>
            ))
          )}
        </FormCard>
      )}

      <FormCard label="RECORD DATA">
        <View style={styles.row}>
          <View style={styles.half}>
            <FormField label="Opening Count" value={form.openingBirdCount} onChangeText={set("openingBirdCount")} error={errors.openingBirdCount} keyboardType="numeric" placeholder="e.g. 5000" />
          </View>
          <View style={styles.half}>
            <FormField label="Mortality" value={form.mortalityCount} onChangeText={set("mortalityCount")} keyboardType="numeric" placeholder="0" />
          </View>
        </View>

        <View style={styles.row}>
          <View style={styles.half}>
            <FormField label="Culled" value={form.culledCount} onChangeText={set("culledCount")} keyboardType="numeric" placeholder="0" />
          </View>
          <View style={styles.half}>
            <FormField label={`Crates (1 = ${EGGS_PER_CRATE} eggs)`} value={crates} onChangeText={handleCratesChange} keyboardType="numeric" placeholder="e.g. 140" />
          </View>
        </View>

        <FormField label="Total Eggs (pieces)" value={form.totalEggs} onChangeText={set("totalEggs")} keyboardType="numeric" placeholder="0" />

        <FormField label="Feed Consumed (kg)" value={form.feedConsumedKg} onChangeText={set("feedConsumedKg")} keyboardType="decimal-pad" placeholder="0" />
      </FormCard>

      {Number(form.feedConsumedKg) > 0 && (
        <FormCard label="DEDUCT FEED FROM STOCK (OPTIONAL)">
          <SelectField label="Warehouse" value={form.feedWarehouseId} options={warehouses} onChange={set("feedWarehouseId")} error={warehousesError ?? undefined} loading={warehousesLoading} placeholder="No warehouse selected" />
          <SelectField label="Feed Product" value={form.feedProductId} options={feedProducts} onChange={set("feedProductId")} placeholder="No product selected" />
        </FormCard>
      )}

      {Number(form.totalEggs) > 0 && (
        <FormCard label="ADD EGGS TO STOCK (OPTIONAL)">
          <SelectField label="Warehouse" value={form.eggWarehouseId} options={warehouses} onChange={set("eggWarehouseId")} error={warehousesError ?? undefined} loading={warehousesLoading} placeholder="No warehouse selected" />
          <SelectField label="Egg Product" value={form.eggProductId} options={eggProducts} onChange={set("eggProductId")} placeholder="No inventory item selected" />
        </FormCard>
      )}

      <FormCard label="NOTES">
        <FormField label="Notes" value={form.notes} onChangeText={set("notes")} placeholder="Optional notes…" multiline numberOfLines={3} style={{ minHeight: 80, textAlignVertical: "top" } as any} />
      </FormCard>

      <Modal visible={!!viewRecord} transparent animationType="slide" statusBarTranslucent onRequestClose={() => setViewRecord(null)}>
        <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={() => setViewRecord(null)}>
          <View style={styles.sheet} onStartShouldSetResponder={() => true}>
            <View style={styles.sheetHandle} />
            {viewRecord && (
              <>
                <Text style={styles.sheetTitle}>{new Date(viewRecord.recordDate).toLocaleDateString(undefined, { weekday: "long", year: "numeric", month: "long", day: "numeric" })}</Text>
                <View style={styles.detailRow}><Text style={styles.detailLabel}>Opening count</Text><Text style={styles.detailValue}>{viewRecord.openingBirdCount != null ? viewRecord.openingBirdCount.toLocaleString() : "—"}</Text></View>
                <View style={styles.detailRow}><Text style={styles.detailLabel}>Mortality</Text><Text style={styles.detailValue}>{viewRecord.mortalityCount}</Text></View>
                <View style={styles.detailRow}><Text style={styles.detailLabel}>Culled</Text><Text style={styles.detailValue}>{viewRecord.culledCount}</Text></View>
                <View style={styles.detailRow}><Text style={styles.detailLabel}>Feed consumed</Text><Text style={styles.detailValue}>{Number(viewRecord.feedConsumedKg).toLocaleString()} kg</Text></View>
                <View style={styles.detailRow}><Text style={styles.detailLabel}>Total eggs</Text><Text style={styles.detailValue}>{viewRecord.totalEggs}</Text></View>
                {viewRecord.notes ? (
                  <View style={styles.detailNotes}>
                    <Text style={styles.detailLabel}>Notes</Text>
                    <Text style={styles.detailNotesText}>{viewRecord.notes}</Text>
                  </View>
                ) : null}
                <TouchableOpacity style={styles.closeBtn} onPress={() => setViewRecord(null)} activeOpacity={0.8}>
                  <Text style={styles.closeBtnText}>Close</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </TouchableOpacity>
      </Modal>
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
  row: { flexDirection: "row", gap: spacing.md },
  half: { flex: 1 },

  recordsMsg: { fontSize: font.size.sm, color: colors.inkLight, paddingVertical: spacing.sm },
  recordRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: spacing.md,
    gap: spacing.md,
  },
  recordRowDivider: { borderTopWidth: 1, borderTopColor: colors.border },
  recordRowText: { flex: 1, gap: 2 },
  recordDate:  { fontSize: font.size.md - 1, fontFamily: font.family.bold, color: colors.ink },
  recordStats: { fontSize: font.size.xs, color: colors.inkLight, fontFamily: font.family.regular },

  overlay: { flex: 1, backgroundColor: colors.overlay, justifyContent: "flex-end" },
  sheet: {
    backgroundColor: colors.bgCard,
    borderTopLeftRadius: radius.xxl,
    borderTopRightRadius: radius.xxl,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    paddingBottom: spacing.xxl,
  },
  sheetHandle: {
    width: 40, height: 4, backgroundColor: colors.border, borderRadius: radius.full,
    alignSelf: "center", marginBottom: spacing.lg,
  },
  sheetTitle: { fontSize: font.size.lg, fontFamily: font.family.bold, color: colors.ink, marginBottom: spacing.md },
  detailRow: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  detailLabel: { fontSize: font.size.sm, color: colors.inkMid, fontFamily: font.family.regular },
  detailValue: { fontSize: font.size.sm, color: colors.ink, fontFamily: font.family.bold },
  detailNotes: { paddingTop: spacing.md, gap: 4 },
  detailNotesText: { fontSize: font.size.sm, color: colors.ink, fontFamily: font.family.regular, lineHeight: 20 },
  closeBtn: {
    marginTop: spacing.lg, backgroundColor: colors.brand, borderRadius: radius.md,
    paddingVertical: spacing.md, alignItems: "center",
  },
  closeBtnText: { color: "#fff", fontSize: font.size.md, fontFamily: font.family.bold },
});
