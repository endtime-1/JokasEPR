import { useMemo, useState } from "react";
import { Alert, StyleSheet, Text, View } from "react-native";
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

export function SoyaBatchScreen() {
  const navigation = useNavigation<any>();
  const today = new Date().toISOString().split("T")[0];

  const [productionSiteId, setProductionSiteId] = useState("");
  const [rawWarehouseId,   setRawWarehouseId]   = useState("");
  const [oilWarehouseId,   setOilWarehouseId]   = useState("");
  const [cakeWarehouseId,  setCakeWarehouseId]  = useState("");
  const [beanProductId,    setBeanProductId]    = useState("");
  const [oilProductId,     setOilProductId]     = useState("");
  const [cakeProductId,    setCakeProductId]    = useState("");
  const [intakeId,         setIntakeId]         = useState("");
  const [beansUsedKg,      setBeansUsedKg]      = useState("");
  const [oilProducedL,     setOilProducedL]     = useState("");
  const [cakeProducedKg,   setCakeProducedKg]   = useState("");
  const [wasteKg,          setWasteKg]          = useState("");
  const [batchNumber,      setBatchNumber]      = useState("");
  const [processingDate,   setProcessingDate]   = useState(today);
  const [errors,           setErrors]           = useState<Record<string, string>>({});

  const { data: opts } = useLookup("soya_options", async () => {
    const r = await fetchSoyaOptions();
    return r.data;
  });

  const siteOptions: SelectOption[]  = useMemo(() => (opts?.productionSites ?? []).map((s) => ({ label: `${s.name}`, value: s.id })), [opts]);
  const whOptions:   SelectOption[]  = useMemo(() => (opts?.warehouses ?? []).map((w)  => ({ label: `${w.name}`, value: w.id })), [opts]);
  const allProducts                  = useMemo(() => opts?.products ?? [], [opts]);
  const prodOptions: SelectOption[]  = useMemo(() => allProducts.map((p) => ({ label: `${p.name} (${p.sku})`, value: p.id })), [allProducts]);
  const intakeOptions: SelectOption[] = useMemo(
    () => [
      { label: "— No intake linked —", value: "" },
      ...(opts?.intakes ?? []).map((i) => ({ label: `${i.receiptNumber} · ${i.supplierName} · ${Number(i.quantityKg).toFixed(0)} kg`, value: i.id })),
    ],
    [opts]
  );

  function validate() {
    const e: Record<string, string> = {};
    if (!productionSiteId) e.productionSiteId = "Select production site";
    if (!rawWarehouseId)   e.rawWarehouseId   = "Select raw materials warehouse";
    if (!oilWarehouseId)   e.oilWarehouseId   = "Select oil output warehouse";
    if (!cakeWarehouseId)  e.cakeWarehouseId  = "Select cake output warehouse";
    if (!beanProductId)    e.beanProductId    = "Select soya bean product";
    if (!oilProductId)     e.oilProductId     = "Select soya oil product";
    if (!cakeProductId)    e.cakeProductId    = "Select soya cake product";
    if (!beansUsedKg || Number(beansUsedKg) <= 0) e.beansUsedKg  = "Enter beans input quantity";
    if (!oilProducedL || Number(oilProducedL) < 0) e.oilProducedL = "Enter oil output quantity";
    if (!cakeProducedKg || Number(cakeProducedKg) < 0) e.cakeProducedKg = "Enter cake output quantity";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  const { submit, loading } = useSubmit({
    module:   "soya_batch",
    endpoint: "/soya-processing/batches",
    onSuccess: () =>
      Alert.alert(
        "Batch Saved",
        "Soya processing batch has been recorded successfully.",
        [{ text: "OK", onPress: () => navigation.goBack() }]
      ),
  });

  const oilYield = beansUsedKg && oilProducedL
    ? ((Number(oilProducedL) / Number(beansUsedKg)) * 100).toFixed(1)
    : null;
  const cakeYield = beansUsedKg && cakeProducedKg
    ? ((Number(cakeProducedKg) / Number(beansUsedKg)) * 100).toFixed(1)
    : null;

  async function handleSubmit() {
    if (!validate()) return;
    await submit({
      productionSiteId,
      rawWarehouseId,
      oilWarehouseId,
      cakeWarehouseId,
      beanProductId,
      oilProductId,
      cakeProductId,
      beansUsedKg:       Number(beansUsedKg),
      oilProducedLitres: Number(oilProducedL),
      cakeProducedKg:    Number(cakeProducedKg),
      ...(wasteKg        ? { wasteKg: Number(wasteKg) } : {}),
      ...(batchNumber    ? { batchNumber }               : {}),
      ...(processingDate ? { processingDate }            : {}),
      ...(intakeId       ? { intakeId }                  : {}),
    });
  }

  return (
    <ScreenWrapper footer={<FormFooter saveLabel="Save Processing Batch" onSave={handleSubmit} loading={loading} />}>
      <View style={styles.pageHeader}>
        <View style={styles.pageIconWrap}>
          <MaterialCommunityIcons name="seed-outline" size={22} color={colors.brand} />
        </View>
        <View>
          <Text style={styles.title}>Soya Processing Batch</Text>
          <Text style={styles.sub}>Record bean input and oil/cake output</Text>
        </View>
      </View>

      <FormCard label="LOCATION">
        <SelectField label="Production Site" value={productionSiteId} options={siteOptions}
          onChange={(v) => { setProductionSiteId(v); setErrors((e) => ({ ...e, productionSiteId: "" })); }}
          required error={errors.productionSiteId} placeholder="Select site…" />

        <SelectField label="Linked Intake (optional)" value={intakeId} options={intakeOptions}
          onChange={setIntakeId} placeholder="Select bean intake receipt…" />
      </FormCard>

      <FormCard label="WAREHOUSES">
        <SelectField label="Raw Material Warehouse" value={rawWarehouseId} options={whOptions}
          onChange={(v) => { setRawWarehouseId(v); setErrors((e) => ({ ...e, rawWarehouseId: "" })); }}
          required error={errors.rawWarehouseId} placeholder="Beans input warehouse…" />

        <View style={styles.row2}>
          <View style={styles.col2}>
            <SelectField label="Oil Warehouse" value={oilWarehouseId} options={whOptions}
              onChange={(v) => { setOilWarehouseId(v); setErrors((e) => ({ ...e, oilWarehouseId: "" })); }}
              required error={errors.oilWarehouseId} placeholder="Oil output…" />
          </View>
          <View style={styles.col2}>
            <SelectField label="Cake Warehouse" value={cakeWarehouseId} options={whOptions}
              onChange={(v) => { setCakeWarehouseId(v); setErrors((e) => ({ ...e, cakeWarehouseId: "" })); }}
              required error={errors.cakeWarehouseId} placeholder="Cake output…" />
          </View>
        </View>
      </FormCard>

      <FormCard label="PRODUCTS">
        <SelectField label="Soya Bean Product" value={beanProductId} options={prodOptions}
          onChange={(v) => { setBeanProductId(v); setErrors((e) => ({ ...e, beanProductId: "" })); }}
          required error={errors.beanProductId} placeholder="Select bean product…" />

        <View style={styles.row2}>
          <View style={styles.col2}>
            <SelectField label="Oil Product" value={oilProductId} options={prodOptions}
              onChange={(v) => { setOilProductId(v); setErrors((e) => ({ ...e, oilProductId: "" })); }}
              required error={errors.oilProductId} placeholder="Oil product…" />
          </View>
          <View style={styles.col2}>
            <SelectField label="Cake Product" value={cakeProductId} options={prodOptions}
              onChange={(v) => { setCakeProductId(v); setErrors((e) => ({ ...e, cakeProductId: "" })); }}
              required error={errors.cakeProductId} placeholder="Cake product…" />
          </View>
        </View>
      </FormCard>

      <FormCard label="QUANTITIES">
        <FormField label="Beans Input (kg)" value={beansUsedKg}
          onChangeText={(v) => { setBeansUsedKg(v); setErrors((e) => ({ ...e, beansUsedKg: "" })); }}
          required error={errors.beansUsedKg} keyboardType="decimal-pad" placeholder="0.00" />

        <View style={styles.row2}>
          <View style={styles.col2}>
            <FormField label="Oil Produced (litres)" value={oilProducedL}
              onChangeText={(v) => { setOilProducedL(v); setErrors((e) => ({ ...e, oilProducedL: "" })); }}
              required error={errors.oilProducedL} keyboardType="decimal-pad" placeholder="0.00" />
          </View>
          <View style={styles.col2}>
            <FormField label="Cake Produced (kg)" value={cakeProducedKg}
              onChangeText={(v) => { setCakeProducedKg(v); setErrors((e) => ({ ...e, cakeProducedKg: "" })); }}
              required error={errors.cakeProducedKg} keyboardType="decimal-pad" placeholder="0.00" />
          </View>
        </View>

        <View style={styles.row2}>
          <View style={styles.col2}>
            <FormField label="Waste (kg)" value={wasteKg} onChangeText={setWasteKg}
              keyboardType="decimal-pad" placeholder="0.00" />
          </View>
          <View style={styles.col2}>
            <FormField label="Processing Date" value={processingDate} onChangeText={setProcessingDate}
              keyboardType="numbers-and-punctuation" placeholder="YYYY-MM-DD" />
          </View>
        </View>

        <FormField label="Batch Number (optional)" value={batchNumber} onChangeText={setBatchNumber}
          placeholder="Auto-generated if blank" />

        {(oilYield || cakeYield) && (
          <View style={styles.yieldCard}>
            <Text style={styles.yieldTitle}>Yield Summary</Text>
            <View style={styles.yieldRow}>
              {oilYield  && <View style={styles.yieldItem}><Text style={styles.yieldNum}>{oilYield}%</Text><Text style={styles.yieldLab}>Oil Yield</Text></View>}
              {cakeYield && <View style={styles.yieldItem}><Text style={styles.yieldNum}>{cakeYield}%</Text><Text style={styles.yieldLab}>Cake Yield</Text></View>}
              {beansUsedKg && oilProducedL && cakeProducedKg && (
                <View style={styles.yieldItem}>
                  <Text style={styles.yieldNum}>
                    {((Number(oilProducedL) + Number(cakeProducedKg)) / Number(beansUsedKg) * 100).toFixed(1)}%
                  </Text>
                  <Text style={styles.yieldLab}>Total Recovery</Text>
                </View>
              )}
            </View>
          </View>
        )}
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

  row2: { flexDirection: "row", gap: spacing.md },
  col2: { flex: 1 },

  yieldCard:  { backgroundColor: "#f0fdf4", borderRadius: radius.xl, borderWidth: 1, borderColor: "#bbf7d0", padding: spacing.lg, gap: spacing.md },
  yieldTitle: { fontSize: font.size.sm, fontWeight: font.weight.bold, color: "#15803d" },
  yieldRow:   { flexDirection: "row", gap: spacing.lg },
  yieldItem:  { alignItems: "center", gap: 2 },
  yieldNum:   { fontSize: font.size.xl, fontWeight: font.weight.extrabold, color: "#15803d" },
  yieldLab:   { fontSize: 9, fontWeight: font.weight.bold, color: "#15803d", textTransform: "uppercase", letterSpacing: 0.4 },
});
