import { useMemo, useState } from "react";
import { Alert, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { ScreenWrapper } from "../../components/ScreenWrapper";
import { FormCard } from "../../components/FormCard";
import { FormFooter } from "../../components/FormFooter";
import { FormField } from "../../components/FormField";
import { SelectField, SelectOption } from "../../components/SelectField";
import { useLookup } from "../../hooks/useLookup";
import { apiFetch } from "../../api/client";
import {
  fetchQualityOptions,
  passQualityCheck,
  failQualityCheck,
  conditionalPassQualityCheck,
} from "../../api/endpoints";
import { colors, font, radius, spacing } from "../../constants/theme";

const CHECK_TYPE_OPTIONS: SelectOption[] = [
  { label: "🌾  Raw Material",      value: "RAW_MATERIAL"    },
  { label: "🏭  Feed Production",   value: "FEED_PRODUCTION" },
  { label: "🫘  Soya Processing",   value: "SOYA_PROCESSING" },
  { label: "📦  Finished Goods",    value: "FINISHED_GOODS"  },
  { label: "🐔  Poultry Health",    value: "POULTRY_HEALTH"  },
  { label: "📥  Goods Received",    value: "GOODS_RECEIVED"  },
];

type Verdict = "PASS" | "FAIL" | "CONDITIONAL";

const VERDICT_OPTS: { v: Verdict; label: string; color: string; bg: string }[] = [
  { v: "PASS",        label: "✅  PASS",        color: "#16a34a", bg: "#dcfce7" },
  { v: "CONDITIONAL", label: "⚠️  CONDITIONAL", color: "#d97706", bg: "#fef3c7" },
  { v: "FAIL",        label: "❌  FAIL",        color: "#dc2626", bg: "#fee2e2" },
];

export function QualityCheckScreen() {
  const navigation = useNavigation<any>();

  const { data: optData } = useLookup("qualityOptions", async () => {
    const r = await fetchQualityOptions();
    return r.data;
  });

  // Step 1 fields
  const [checkType,   setCheckType]   = useState("RAW_MATERIAL");
  const [templateId,  setTemplateId]  = useState("");
  const [farmId,      setFarmId]      = useState("");
  const [warehouseId, setWarehouseId] = useState("");
  const [siteId,      setSiteId]      = useState("");
  const [batchNumber, setBatchNumber] = useState("");
  const [summary,     setSummary]     = useState("");
  const [notes,       setNotes]       = useState("");

  // Step 2 state
  const [createdId,     setCreatedId]     = useState<string | null>(null);
  const [verdict,       setVerdict]       = useState<Verdict | null>(null);
  const [reason,        setReason]        = useState("");
  const [verdictNotes,  setVerdictNotes]  = useState("");
  const [loading,       setLoading]       = useState(false);

  const farmOpts: SelectOption[] = useMemo(
    () => [{ label: "— Select farm —", value: "" }, ...(optData?.farms ?? []).map((f) => ({ label: f.name, value: f.id }))],
    [optData],
  );
  const warehouseOpts: SelectOption[] = useMemo(
    () => [{ label: "— Select warehouse —", value: "" }, ...(optData?.warehouses ?? []).map((w) => ({ label: w.name, value: w.id }))],
    [optData],
  );
  const siteOpts: SelectOption[] = useMemo(
    () => [{ label: "— Select site —", value: "" }, ...(optData?.productionSites ?? []).map((s) => ({ label: s.name, value: s.id }))],
    [optData],
  );
  const templateOpts: SelectOption[] = useMemo(
    () => [
      { label: "— No template —", value: "" },
      ...(optData?.templates ?? []).filter((t) => t.checkType === checkType).map((t) => ({ label: t.name, value: t.id })),
    ],
    [optData, checkType],
  );

  const needsFarm      = ["RAW_MATERIAL", "POULTRY_HEALTH"].includes(checkType);
  const needsWarehouse = ["GOODS_RECEIVED", "FINISHED_GOODS"].includes(checkType);
  const needsSite      = ["FEED_PRODUCTION", "SOYA_PROCESSING"].includes(checkType);

  async function handleCreate() {
    setLoading(true);
    try {
      const payload: Record<string, unknown> = {
        checkType,
        batchNumber:      batchNumber.trim() || undefined,
        summary:          summary.trim() || undefined,
        notes:            notes.trim() || undefined,
        templateId:       templateId || undefined,
        farmId:           (needsFarm && farmId) ? farmId : undefined,
        warehouseId:      (needsWarehouse && warehouseId) ? warehouseId : undefined,
        productionSiteId: (needsSite && siteId) ? siteId : undefined,
      };
      const r = await apiFetch<{ data: { id: string } }>("/quality/checks", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      setCreatedId(r.data.id);
    } catch (err) {
      Alert.alert("Error", err instanceof Error ? err.message : "Failed to create inspection");
    } finally {
      setLoading(false);
    }
  }

  async function handleVerdict() {
    if (!createdId || !verdict) return;
    if (verdict === "FAIL" && !reason.trim()) {
      return Alert.alert("Required", "Enter a reason for the failure");
    }
    if (verdict === "CONDITIONAL" && !verdictNotes.trim()) {
      return Alert.alert("Required", "Enter the conditions that must be met");
    }
    setLoading(true);
    try {
      if (verdict === "PASS") {
        await passQualityCheck(createdId, { notes: verdictNotes.trim() || undefined });
      } else if (verdict === "FAIL") {
        await failQualityCheck(createdId, { reason: reason.trim(), notes: verdictNotes.trim() || undefined });
      } else {
        await conditionalPassQualityCheck(createdId, { conditions: verdictNotes.trim(), notes: verdictNotes.trim() || undefined });
      }
      Alert.alert("Inspection Submitted", "Quality check has been recorded.", [
        { text: "OK", onPress: () => navigation.goBack() },
      ]);
    } catch (err) {
      Alert.alert("Error", err instanceof Error ? err.message : "Failed to record verdict");
    } finally {
      setLoading(false);
    }
  }

  // ── Step 2: Verdict ───────────────────────────────────────────────────────
  if (createdId) {
    return (
      <ScreenWrapper footer={<FormFooter saveLabel="Submit Verdict" onSave={handleVerdict} loading={loading} />}>
        <View style={styles.pageHeader}>
          <View style={styles.pageIconWrap}>
            <MaterialCommunityIcons name="magnify-scan" size={22} color={colors.brand} />
          </View>
          <View>
            <Text style={styles.title}>Inspection Verdict</Text>
            <Text style={styles.sub}>Record the inspection outcome</Text>
          </View>
        </View>

        <FormCard label="RESULT">
          <View style={styles.verdictRow}>
            {VERDICT_OPTS.map(({ v, label, color, bg }) => (
              <TouchableOpacity
                key={v}
                style={[styles.verdictBtn, verdict === v && { borderColor: color, backgroundColor: bg }]}
                onPress={() => setVerdict(v)}
                activeOpacity={0.75}
              >
                <Text style={[styles.verdictLabel, verdict === v && { color }]}>{label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {verdict === "FAIL" && (
            <FormField
              label="Failure Reason *"
              value={reason}
              onChangeText={setReason}
              placeholder="Describe why this failed..."
            />
          )}

          {(verdict === "CONDITIONAL" || verdict === "PASS") && (
            <FormField
              label={verdict === "CONDITIONAL" ? "Conditions to Meet *" : "Notes (optional)"}
              value={verdictNotes}
              onChangeText={setVerdictNotes}
              placeholder={verdict === "CONDITIONAL" ? "List conditions that must be fulfilled..." : "Any additional observations..."}
              multiline
              numberOfLines={3}
            />
          )}
        </FormCard>
      </ScreenWrapper>
    );
  }

  // ── Step 1: Create Check ──────────────────────────────────────────────────
  return (
    <ScreenWrapper footer={<FormFooter saveLabel="Create Inspection →" onSave={handleCreate} loading={loading} />}>
      <View style={styles.pageHeader}>
        <View style={styles.pageIconWrap}>
          <MaterialCommunityIcons name="magnify-scan" size={22} color={colors.brand} />
        </View>
        <View>
          <Text style={styles.title}>Quality Inspection</Text>
          <Text style={styles.sub}>Log a new quality check</Text>
        </View>
      </View>

      <FormCard label="INSPECTION DETAILS">
        <SelectField
          label="Check Type *"
          options={CHECK_TYPE_OPTIONS}
          value={checkType}
          onChange={(v) => { setCheckType(v); setTemplateId(""); setFarmId(""); setWarehouseId(""); setSiteId(""); }}
          required
        />

        {templateOpts.length > 1 && (
          <SelectField
            label="Template (optional)"
            options={templateOpts}
            value={templateId}
            onChange={setTemplateId}
          />
        )}

        {needsFarm && (
          <SelectField label="Farm" options={farmOpts} value={farmId} onChange={setFarmId} />
        )}
        {needsWarehouse && (
          <SelectField label="Warehouse" options={warehouseOpts} value={warehouseId} onChange={setWarehouseId} />
        )}
        {needsSite && (
          <SelectField label="Production Site" options={siteOpts} value={siteId} onChange={setSiteId} />
        )}

        <FormField
          label="Batch / Reference Number"
          value={batchNumber}
          onChangeText={setBatchNumber}
          placeholder="e.g. BATCH-2024-001"
        />

        <FormField
          label="Summary"
          value={summary}
          onChangeText={setSummary}
          placeholder="Brief description of what is being inspected..."
          multiline
          numberOfLines={2}
        />
      </FormCard>

      <FormCard label="NOTES">
        <FormField
          label="Notes"
          value={notes}
          onChangeText={setNotes}
          placeholder="Detailed observations, measurements, etc."
          multiline
          numberOfLines={3}
        />
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

  verdictRow:   { flexDirection: "row", gap: spacing.sm },
  verdictBtn:   { flex: 1, paddingVertical: spacing.sm, borderRadius: radius.md, borderWidth: 2, borderColor: colors.border, alignItems: "center" },
  verdictLabel: { fontSize: font.size.sm, fontWeight: font.weight.semibold as any, color: colors.inkLight, textAlign: "center" },
});
