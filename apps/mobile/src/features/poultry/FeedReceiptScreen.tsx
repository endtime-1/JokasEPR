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
import { fetchPoultryOptions, fetchFeedStock } from "../../api/endpoints";
import { useAuth } from "../../auth/AuthContext";
import { colors, font, spacing } from "../../constants/theme";

const SOURCES: SelectOption[] = [
  { label: "Supplier", value: "SUPPLIER" },
  { label: "Feed mill", value: "FEED_MILL" },
  { label: "Other", value: "OTHER" },
];

export function FeedReceiptScreen() {
  const { user } = useAuth();
  const navigation = useNavigation<any>();

  const [farmId, setFarmId] = useState("");
  const [warehouseId, setWarehouseId] = useState("");
  const [feedProductId, setFeedProductId] = useState("");
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [quantityKg, setQuantityKg] = useState("");
  const [sourceType, setSourceType] = useState("SUPPLIER");
  const [supplierName, setSupplierName] = useState("");
  const [billReference, setBillReference] = useState("");
  const [unitCost, setUnitCost] = useState("");
  const [notes, setNotes] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});

  const { data: opts } = useLookup("poultry-options", fetchPoultryOptions);

  const farms: SelectOption[] = useMemo(() => {
    const all = opts?.data.farms ?? [];
    const assigned = (user?.hasGlobalAccess || !user?.farmIds?.length) ? all : all.filter((f) => user?.farmIds?.includes(f.id));
    return assigned.map((f) => ({ label: f.name, value: f.id }));
  }, [opts, user]);

  const feedStores: SelectOption[] = useMemo(
    () => (opts?.data.feedWarehouses ?? []).filter((w) => !farmId || w.farmId === farmId).map((w) => ({ label: w.code ? `${w.name} (${w.code})` : w.name, value: w.id })),
    [opts, farmId]
  );
  const feedProducts: SelectOption[] = useMemo(
    () => (opts?.data.feedProducts ?? []).map((p) => ({ label: p.sku ? `${p.sku} — ${p.name}` : p.name, value: p.id })),
    [opts]
  );

  // Auto-select the farm's feed store (usually the only one).
  useEffect(() => {
    setWarehouseId((prev) => (feedStores.find((w) => w.value === prev) ? prev : (feedStores[0]?.value ?? "")));
  }, [feedStores]);

  // Read-only "feed on hand" summary for the selected farm.
  const { data: stock } = useLookup(`feed-stock:${farmId}`, () => fetchFeedStock(farmId), !farmId);
  const totals = stock?.data.totals;

  function validate() {
    const e: Record<string, string> = {};
    if (!farmId) e.farmId = "Select farm";
    if (!warehouseId) e.warehouseId = "Select feed store";
    if (!feedProductId) e.feedProductId = "Select feed product";
    if (!date) e.date = "Date required";
    if (!quantityKg || isNaN(Number(quantityKg)) || Number(quantityKg) <= 0) e.quantityKg = "Enter quantity";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  const { submit, loading } = useSubmit({
    module: "poultry_feed_receipt",
    endpoint: "/poultry/feed-receipts",
    sendIdempotencyKeyInBody: true,
    onSuccess: (queued) => {
      Alert.alert(
        queued ? "Saved Offline" : "Saved",
        queued
          ? "The feed receipt was saved on this device and will sync automatically once you're back online."
          : "Feed receipt recorded — the feed store stock has been updated.",
        [{ text: "OK", onPress: () => navigation.goBack() }]
      );
    },
  });

  async function handleSubmit() {
    if (!validate()) return;
    await submit({
      farmId,
      warehouseId,
      feedProductId,
      receiptDate: date,
      quantityKg: Number(quantityKg),
      sourceType,
      supplierName: sourceType === "SUPPLIER" && supplierName ? supplierName : undefined,
      billReference: billReference || undefined,
      unitCost: unitCost ? Number(unitCost) : undefined,
      notes: notes || undefined,
    });
  }

  return (
    <ScreenWrapper footer={<FormFooter saveLabel="Save Feed Receipt" onSave={handleSubmit} loading={loading} />}>
      <View style={styles.pageHeader}>
        <View style={styles.pageIconWrap}>
          <MaterialCommunityIcons name="warehouse" size={22} color={colors.brand} />
        </View>
        <View>
          <Text style={styles.title}>Feed Store Receipt</Text>
          <Text style={styles.sub}>Record feed arriving at the farm feed store</Text>
        </View>
      </View>

      <FormCard label="FARM / FEED STORE">
        <SelectField
          label="Farm"
          value={farmId}
          options={farms}
          onChange={(v) => { setFarmId(v); setWarehouseId(""); }}
          error={errors.farmId}
          required
        />
        <SelectField
          label="Feed Store"
          value={warehouseId}
          options={feedStores}
          onChange={setWarehouseId}
          error={errors.warehouseId}
          required
          placeholder={farmId ? (feedStores.length === 0 ? "No feed store on this farm" : "Select feed store…") : "Select farm first"}
        />
        {totals && (
          <View style={styles.onHandChip}>
            <MaterialCommunityIcons name="barley" size={13} color={colors.brand} />
            <Text style={styles.onHandText}>
              {(totals.onHandKg ?? 0).toLocaleString()} kg on hand · {(totals.receivedKg ?? 0).toLocaleString()} received · {(totals.consumedKg ?? 0).toLocaleString()} fed
            </Text>
          </View>
        )}
      </FormCard>

      <FormCard label="DELIVERY">
        <SelectField label="Feed Product" value={feedProductId} options={feedProducts} onChange={setFeedProductId} error={errors.feedProductId} required />
        <View style={styles.row}>
          <View style={styles.half}>
            <FormField
              label="Quantity (kg)"
              required
              value={quantityKg}
              onChangeText={(v) => { setQuantityKg(v); setErrors((e) => ({ ...e, quantityKg: "" })); }}
              error={errors.quantityKg}
              keyboardType="decimal-pad"
              placeholder="e.g. 1000"
            />
          </View>
          <View style={styles.half}>
            <FormField label="Unit cost / kg" value={unitCost} onChangeText={setUnitCost} keyboardType="decimal-pad" placeholder="Optional" />
          </View>
        </View>
        <DateField label="Date received" required value={date} onChangeText={setDate} error={errors.date} />
        <SelectField label="Source" value={sourceType} options={SOURCES} onChange={setSourceType} required />
        {sourceType === "SUPPLIER" && (
          <FormField label="Supplier name" value={supplierName} onChangeText={setSupplierName} placeholder="Optional" />
        )}
        <FormField label="Waybill / delivery note #" value={billReference} onChangeText={setBillReference} placeholder="The stock bill for this delivery" />
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
    </ScreenWrapper>
  );
}

const styles = StyleSheet.create({
  pageHeader: { flexDirection: "row", alignItems: "center", gap: 12 },
  pageIconWrap: {
    width: 48, height: 48, borderRadius: 12,
    backgroundColor: colors.brandLight,
    borderWidth: 1, borderColor: colors.brandMid,
    alignItems: "center", justifyContent: "center",
  },
  title: { fontSize: font.size.xl, fontFamily: font.family.extrabold, color: colors.ink },
  sub: { fontSize: font.size.sm, color: colors.inkMid, fontFamily: font.family.regular },
  onHandChip: {
    flexDirection: "row", alignItems: "center", gap: 5, alignSelf: "flex-start",
    backgroundColor: colors.brandLight, borderWidth: 1, borderColor: colors.brandMid,
    paddingHorizontal: spacing.md, paddingVertical: 4, borderRadius: 20,
  },
  onHandText: { fontSize: font.size.xs, color: colors.brandDark, fontFamily: font.family.bold },
  row: { flexDirection: "row", gap: spacing.md },
  half: { flex: 1 },
});
