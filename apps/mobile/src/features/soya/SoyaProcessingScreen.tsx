import { useMemo, useState } from "react";
import { Alert, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { ScreenWrapper } from "../../components/ScreenWrapper";
import { FormCard } from "../../components/FormCard";
import { FormFooter } from "../../components/FormFooter";
import { FormField } from "../../components/FormField";
import { SelectField, SelectOption } from "../../components/SelectField";
import { useSubmit } from "../../hooks/useSubmit";
import { useLookup } from "../../hooks/useLookup";
import { fetchSoyaOptions } from "../../api/endpoints";
import { colors, font, radius, spacing } from "../../constants/theme";

const QUALITY_OPTIONS: SelectOption[] = [
  { label: "✅  Grade A",          value: "GRADE_A"   },
  { label: "✅  Grade B",          value: "GRADE_B"   },
  { label: "⚠️  Marginal",         value: "MARGINAL"  },
  { label: "❌  Rejected",         value: "REJECTED"  },
];

const TABS = ["Bean Intake", "Processing Batch"] as const;
type Tab = typeof TABS[number];

export function SoyaProcessingScreen() {
  const navigation = useNavigation<any>();
  const [activeTab, setActiveTab] = useState<Tab>("Bean Intake");

  const { data: optData } = useLookup("soyaOptions", async () => {
    const r = await fetchSoyaOptions();
    return r.data;
  });

  const siteOpts: SelectOption[] = useMemo(
    () => (optData?.productionSites ?? []).map((s) => ({ label: s.code ? `${s.code} – ${s.name}` : s.name, value: s.id })),
    [optData]
  );
  const whOpts: SelectOption[] = useMemo(
    () => (optData?.warehouses ?? []).map((w) => ({ label: w.code ? `${w.code} – ${w.name}` : w.name, value: w.id })),
    [optData]
  );
  const prodOpts: SelectOption[] = useMemo(
    () => (optData?.products ?? []).map((p) => ({ label: p.sku ? `${p.name} (${p.sku})` : p.name, value: p.id })),
    [optData]
  );

  return (
    <ScreenWrapper>
      {/* Page header */}
      <View style={styles.pageHeader}>
        <View style={styles.pageIconWrap}>
          <MaterialCommunityIcons name="seed" size={22} color={colors.brand} />
        </View>
        <View>
          <Text style={styles.title}>Soya Processing</Text>
          <Text style={styles.sub}>Log intake or processing batch</Text>
        </View>
      </View>

      {/* Tab bar */}
      <View style={styles.tabBar}>
        {TABS.map((tab) => (
          <TouchableOpacity
            key={tab}
            style={[styles.tab, activeTab === tab && styles.tabActive]}
            onPress={() => setActiveTab(tab)}
            activeOpacity={0.75}
          >
            <Text style={[styles.tabLabel, activeTab === tab && styles.tabLabelActive]}>{tab}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {activeTab === "Bean Intake" ? (
        <IntakeForm
          siteOpts={siteOpts}
          whOpts={whOpts}
          prodOpts={prodOpts}
          onSuccess={() => navigation.goBack()}
        />
      ) : (
        <BatchForm
          siteOpts={siteOpts}
          whOpts={whOpts}
          prodOpts={prodOpts}
          onSuccess={() => navigation.goBack()}
        />
      )}
    </ScreenWrapper>
  );
}

// ── Bean Intake Form ──────────────────────────────────────────────────────────

function IntakeForm({
  siteOpts, whOpts, prodOpts, onSuccess
}: {
  siteOpts: SelectOption[];
  whOpts: SelectOption[];
  prodOpts: SelectOption[];
  onSuccess: () => void;
}) {
  const navigation = useNavigation<any>();
  const [siteId,       setSiteId]       = useState("");
  const [warehouseId,  setWarehouseId]  = useState("");
  const [productId,    setProductId]    = useState("");
  const [supplier,     setSupplier]     = useState("");
  const [receipt,      setReceipt]      = useState("");
  const [quantityKg,   setQuantityKg]   = useState("");
  const [unitCost,     setUnitCost]     = useState("");
  const [moisture,     setMoisture]     = useState("");
  const [quality,      setQuality]      = useState("GRADE_A");
  const [notes,        setNotes]        = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});

  function validate() {
    const e: Record<string, string> = {};
    if (!siteId)      e.siteId      = "Select a production site";
    if (!warehouseId) e.warehouseId = "Select a warehouse";
    if (!productId)   e.productId   = "Select the soya bean product";
    if (!supplier)    e.supplier    = "Enter supplier name";
    if (!receipt)     e.receipt     = "Enter receipt number";
    if (!quantityKg || isNaN(Number(quantityKg)) || Number(quantityKg) <= 0)
      e.quantityKg = "Enter a valid quantity";
    if (!unitCost || isNaN(Number(unitCost)) || Number(unitCost) < 0)
      e.unitCost = "Enter a valid unit cost";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  const { submit, loading } = useSubmit({
    module: "soya_intake",
    endpoint: "/soya-processing/intakes",
    onSuccess: () => Alert.alert("Saved", "Bean intake recorded.", [{ text: "OK", onPress: onSuccess }]),
  });

  async function handleSubmit() {
    if (!validate()) return;
    await submit({
      productionSiteId: siteId,
      warehouseId,
      productId,
      supplierName: supplier,
      receiptNumber: receipt,
      quantityKg: Number(quantityKg),
      unitCost: Number(unitCost),
      moisturePercent: moisture ? Number(moisture) : undefined,
      qualityStatus: quality,
      notes: notes || undefined,
    });
  }

  return (
    <>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionIcon}>📥</Text>
        <Text style={styles.sectionTitle}>Record Bean Delivery</Text>
      </View>

      <FormCard label="LOCATION">
        <SelectField label="Production Site" value={siteId} options={siteOpts}
          onChange={(v) => { setSiteId(v); setErrors((e) => ({ ...e, siteId: "" })); }}
          error={errors.siteId} required placeholder="Select site…" />

        <SelectField label="Receiving Warehouse" value={warehouseId} options={whOpts}
          onChange={(v) => { setWarehouseId(v); setErrors((e) => ({ ...e, warehouseId: "" })); }}
          error={errors.warehouseId} required placeholder="Select warehouse…" />

        <SelectField label="Soya Bean Product" value={productId} options={prodOpts}
          onChange={(v) => { setProductId(v); setErrors((e) => ({ ...e, productId: "" })); }}
          error={errors.productId} required placeholder="Select product…" />
      </FormCard>

      <FormCard label="INTAKE DATA">
        <View style={styles.row}>
          <View style={styles.half}>
            <FormField label="Supplier Name" required value={supplier}
              onChangeText={(v) => { setSupplier(v); setErrors((e) => ({ ...e, supplier: "" })); }}
              error={errors.supplier} placeholder="e.g. Kusi Farms" />
          </View>
          <View style={styles.half}>
            <FormField label="Receipt No." required value={receipt}
              onChangeText={(v) => { setReceipt(v); setErrors((e) => ({ ...e, receipt: "" })); }}
              error={errors.receipt} placeholder="e.g. REC-001" />
          </View>
        </View>

        <View style={styles.row}>
          <View style={styles.half}>
            <FormField label="Quantity (kg)" required value={quantityKg}
              onChangeText={(v) => { setQuantityKg(v); setErrors((e) => ({ ...e, quantityKg: "" })); }}
              error={errors.quantityKg} keyboardType="decimal-pad" placeholder="e.g. 5000" />
          </View>
          <View style={styles.half}>
            <FormField label="Unit Cost (GHS/kg)" required value={unitCost}
              onChangeText={(v) => { setUnitCost(v); setErrors((e) => ({ ...e, unitCost: "" })); }}
              error={errors.unitCost} keyboardType="decimal-pad" placeholder="e.g. 4.50" />
          </View>
        </View>

        <View style={styles.row}>
          <View style={styles.half}>
            <FormField label="Moisture %" value={moisture} onChangeText={setMoisture}
              keyboardType="decimal-pad" placeholder="e.g. 12.5" />
          </View>
          <View style={styles.half}>
            <SelectField label="Quality Grade" value={quality} options={QUALITY_OPTIONS}
              onChange={setQuality} />
          </View>
        </View>
      </FormCard>

      <FormCard label="NOTES">
        <FormField label="Notes" value={notes} onChangeText={setNotes} multiline numberOfLines={3}
          style={{ minHeight: 80, textAlignVertical: "top" } as any}
          placeholder="Optional notes about this delivery…" />
      </FormCard>

      <FormFooter saveLabel="Save Bean Intake" onSave={handleSubmit} loading={loading} />
    </>
  );
}

// ── Processing Batch Form ─────────────────────────────────────────────────────

function BatchForm({
  siteOpts, whOpts, prodOpts, onSuccess
}: {
  siteOpts: SelectOption[];
  whOpts: SelectOption[];
  prodOpts: SelectOption[];
  onSuccess: () => void;
}) {
  const [siteId,        setSiteId]        = useState("");
  const [rawWhId,       setRawWhId]       = useState("");
  const [oilWhId,       setOilWhId]       = useState("");
  const [cakeWhId,      setCakeWhId]      = useState("");
  const [beanProdId,    setBeanProdId]    = useState("");
  const [oilProdId,     setOilProdId]     = useState("");
  const [cakeProdId,    setCakeProdId]    = useState("");
  const [batchNumber,   setBatchNumber]   = useState("");
  const [beansKg,       setBeansKg]       = useState("");
  const [oilLitres,     setOilLitres]     = useState("");
  const [cakeKg,        setCakeKg]        = useState("");
  const [wasteKg,       setWasteKg]       = useState("");
  const [processingDate, setProcessingDate] = useState(new Date().toISOString().slice(0, 10));
  const [errors, setErrors] = useState<Record<string, string>>({});

  function validate() {
    const e: Record<string, string> = {};
    if (!siteId)     e.siteId     = "Select a production site";
    if (!rawWhId)    e.rawWhId    = "Select raw material warehouse";
    if (!oilWhId)    e.oilWhId    = "Select oil output warehouse";
    if (!cakeWhId)   e.cakeWhId   = "Select cake output warehouse";
    if (!beanProdId) e.beanProdId = "Select soya bean product";
    if (!oilProdId)  e.oilProdId  = "Select soya oil product";
    if (!cakeProdId) e.cakeProdId = "Select soya cake product";
    if (!beansKg || isNaN(Number(beansKg)) || Number(beansKg) <= 0)
      e.beansKg = "Enter beans used (kg)";
    if (!oilLitres || isNaN(Number(oilLitres)) || Number(oilLitres) < 0)
      e.oilLitres = "Enter oil produced (litres)";
    if (!cakeKg || isNaN(Number(cakeKg)) || Number(cakeKg) < 0)
      e.cakeKg = "Enter cake produced (kg)";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  const { submit, loading } = useSubmit({
    module: "soya_batch",
    endpoint: "/soya-processing/batches",
    onSuccess: () => Alert.alert("Saved", "Processing batch recorded.", [{ text: "OK", onPress: onSuccess }]),
  });

  const yieldPct = beansKg && oilLitres && cakeKg
    ? Math.round(((Number(oilLitres) + Number(cakeKg)) / Number(beansKg)) * 100)
    : null;

  async function handleSubmit() {
    if (!validate()) return;
    await submit({
      productionSiteId: siteId,
      rawWarehouseId: rawWhId,
      oilWarehouseId: oilWhId,
      cakeWarehouseId: cakeWhId,
      beanProductId: beanProdId,
      oilProductId: oilProdId,
      cakeProductId: cakeProdId,
      batchNumber: batchNumber || undefined,
      beansUsedKg: Number(beansKg),
      oilProducedLitres: Number(oilLitres),
      cakeProducedKg: Number(cakeKg),
      wasteKg: wasteKg ? Number(wasteKg) : undefined,
      processingDate: processingDate || undefined,
    });
  }

  return (
    <>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionIcon}>⚙️</Text>
        <Text style={styles.sectionTitle}>Record Processing Batch</Text>
      </View>

      {yieldPct !== null && (
        <View style={[styles.yieldBadge, { backgroundColor: yieldPct >= 80 ? "#f0fdf4" : "#fffbeb", borderColor: yieldPct >= 80 ? "#86efac" : "#fde68a" }]}>
          <Text style={[styles.yieldText, { color: yieldPct >= 80 ? "#15803d" : "#d97706" }]}>
            Estimated yield: {yieldPct}% (oil + cake output vs beans used)
          </Text>
        </View>
      )}

      <FormCard label="LOCATION">
        <SelectField label="Production Site" value={siteId} options={siteOpts}
          onChange={(v) => { setSiteId(v); setErrors((e) => ({ ...e, siteId: "" })); }}
          error={errors.siteId} required placeholder="Select site…" />

        <View style={styles.row}>
          <View style={styles.half}>
            <FormField label="Processing Date" value={processingDate} onChangeText={setProcessingDate}
              placeholder="YYYY-MM-DD" />
          </View>
          <View style={styles.half}>
            <FormField label="Batch Number" value={batchNumber} onChangeText={setBatchNumber}
              placeholder="e.g. SPB-001" />
          </View>
        </View>
      </FormCard>

      <FormCard label="WAREHOUSE ROUTING">
        <SelectField label="Raw Material Warehouse" value={rawWhId} options={whOpts}
          onChange={(v) => { setRawWhId(v); setErrors((e) => ({ ...e, rawWhId: "" })); }}
          error={errors.rawWhId} required placeholder="Where beans come from…" />

        <View style={styles.row}>
          <View style={styles.half}>
            <SelectField label="Oil Output WH" value={oilWhId} options={whOpts}
              onChange={(v) => { setOilWhId(v); setErrors((e) => ({ ...e, oilWhId: "" })); }}
              error={errors.oilWhId} required placeholder="Oil destination…" />
          </View>
          <View style={styles.half}>
            <SelectField label="Cake Output WH" value={cakeWhId} options={whOpts}
              onChange={(v) => { setCakeWhId(v); setErrors((e) => ({ ...e, cakeWhId: "" })); }}
              error={errors.cakeWhId} required placeholder="Cake destination…" />
          </View>
        </View>
      </FormCard>

      <FormCard label="PRODUCTS">
        <SelectField label="Soya Bean Product" value={beanProdId} options={prodOpts}
          onChange={(v) => { setBeanProdId(v); setErrors((e) => ({ ...e, beanProdId: "" })); }}
          error={errors.beanProdId} required placeholder="Select product…" />

        <View style={styles.row}>
          <View style={styles.half}>
            <SelectField label="Oil Product" value={oilProdId} options={prodOpts}
              onChange={(v) => { setOilProdId(v); setErrors((e) => ({ ...e, oilProdId: "" })); }}
              error={errors.oilProdId} required placeholder="Select…" />
          </View>
          <View style={styles.half}>
            <SelectField label="Cake Product" value={cakeProdId} options={prodOpts}
              onChange={(v) => { setCakeProdId(v); setErrors((e) => ({ ...e, cakeProdId: "" })); }}
              error={errors.cakeProdId} required placeholder="Select…" />
          </View>
        </View>
      </FormCard>

      <FormCard label="QUANTITIES">
        <View style={styles.row}>
          <View style={styles.half}>
            <FormField label="Beans Used (kg)" required value={beansKg}
              onChangeText={(v) => { setBeansKg(v); setErrors((e) => ({ ...e, beansKg: "" })); }}
              error={errors.beansKg} keyboardType="decimal-pad" placeholder="e.g. 1000" />
          </View>
          <View style={styles.half}>
            <FormField label="Oil Produced (L)" required value={oilLitres}
              onChangeText={(v) => { setOilLitres(v); setErrors((e) => ({ ...e, oilLitres: "" })); }}
              error={errors.oilLitres} keyboardType="decimal-pad" placeholder="e.g. 180" />
          </View>
        </View>

        <View style={styles.row}>
          <View style={styles.half}>
            <FormField label="Cake Produced (kg)" required value={cakeKg}
              onChangeText={(v) => { setCakeKg(v); setErrors((e) => ({ ...e, cakeKg: "" })); }}
              error={errors.cakeKg} keyboardType="decimal-pad" placeholder="e.g. 750" />
          </View>
          <View style={styles.half}>
            <FormField label="Waste (kg)" value={wasteKg} onChangeText={setWasteKg}
              keyboardType="decimal-pad" placeholder="e.g. 20" />
          </View>
        </View>
      </FormCard>

      <FormFooter saveLabel="Save Processing Batch" onSave={handleSubmit} loading={loading} />
    </>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

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

  tabBar: {
    flexDirection: "row",
    backgroundColor: colors.bgCard,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 4,
    gap: 4,
  },
  tab: {
    flex: 1,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    alignItems: "center",
  },
  tabActive: {
    backgroundColor: colors.brand,
  },
  tabLabel: {
    fontSize: font.size.sm,
    fontWeight: font.weight.semibold,
    color: colors.inkLight,
  },
  tabLabelActive: {
    color: colors.white,
  },

  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingBottom: spacing.sm,
  },
  sectionIcon: { fontSize: 18 },
  sectionTitle: { fontSize: font.size.md, fontWeight: font.weight.bold, color: colors.ink },

  yieldBadge: {
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.md,
  },
  yieldText: { fontSize: font.size.sm, fontWeight: font.weight.semibold },

  row: { flexDirection: "row", gap: spacing.md },
  half: { flex: 1 },
});
