import { useMemo, useState } from "react";
import { Alert, StyleSheet, Text, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { ScreenWrapper } from "../../components/ScreenWrapper";
import { FormCard } from "../../components/FormCard";
import { FormFooter } from "../../components/FormFooter";
import { FormField } from "../../components/FormField";
import { SelectField, SelectOption } from "../../components/SelectField";
import { useLookup } from "../../hooks/useLookup";
import { fetchFlockBatches, fetchFarms, updateBatchStatus } from "../../api/endpoints";
import { useAuth } from "../../auth/AuthContext";
import { colors, font, spacing } from "../../constants/theme";

const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  PLANNED:     ["ACTIVE", "CULLED"],
  ACTIVE:      ["TRANSFERRED", "CLOSED", "SOLD", "CULLED"],
  TRANSFERRED: ["CLOSED", "SOLD", "CULLED"],
  CLOSED:      ["SOLD"],
  SOLD:        [],
  CULLED:      [],
};

const STATUS_COLORS: Record<string, string> = {
  PLANNED:     "#3B82F6",
  ACTIVE:      "#10B981",
  TRANSFERRED: "#D97706",
  CLOSED:      "#6B7280",
  SOLD:        "#8B5CF6",
  CULLED:      "#EF4444",
};

export function BatchStatusUpdateScreen() {
  const { user } = useAuth();
  const navigation = useNavigation<any>();
  const [farmId, setFarmId]       = useState("");
  const [batchId, setBatchId]     = useState("");
  const [newStatus, setNewStatus] = useState("");
  const [notes, setNotes]         = useState("");
  const [loading, setLoading]     = useState(false);
  const [errors, setErrors]       = useState<Record<string, string>>({});

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
    () => (rawBatches ?? []).map((b: any) => ({ label: `${b.code} — ${b.name} (${b.status ?? "?"})`, value: b.id })),
    [rawBatches]
  );

  const selectedBatch = useMemo(
    () => (rawBatches ?? []).find((b: any) => b.id === batchId) as any,
    [rawBatches, batchId]
  );

  const currentStatus: string = selectedBatch?.status ?? "";
  const validTransitions       = ALLOWED_TRANSITIONS[currentStatus] ?? [];
  const transitionOptions: SelectOption[] = validTransitions.map((s) => ({ label: s, value: s }));

  function validate() {
    const e: Record<string, string> = {};
    if (!farmId)     e.farmId     = "Select a farm";
    if (!batchId)    e.batchId    = "Select a batch";
    if (!newStatus)  e.newStatus  = "Select new status";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function handleSubmit() {
    if (!validate()) return;
    setLoading(true);
    try {
      await updateBatchStatus(batchId, { status: newStatus, notes: notes || undefined });
      Alert.alert("Updated", `Batch status changed to ${newStatus}.`, [{ text: "OK", onPress: () => navigation.goBack() }]);
    } catch (err: any) {
      Alert.alert("Error", err.message ?? "Failed to update status");
    } finally {
      setLoading(false);
    }
  }

  return (
    <ScreenWrapper footer={<FormFooter saveLabel="Update Status" onSave={handleSubmit} loading={loading} />}>
      <View style={styles.pageHeader}>
        <View style={styles.pageIconWrap}>
          <MaterialCommunityIcons name="swap-horizontal" size={22} color={colors.brand} />
        </View>
        <View>
          <Text style={styles.title}>Batch Status Update</Text>
          <Text style={styles.sub}>Transition a flock batch to a new status</Text>
        </View>
      </View>

      <FormCard label="FLOCK / BATCH">
        <SelectField label="Farm" value={farmId} options={farms} onChange={(v) => { setFarmId(v); setBatchId(""); setNewStatus(""); setErrors((e) => ({ ...e, farmId: "" })); }} error={errors.farmId} required />
        <SelectField label="Flock Batch" value={batchId} options={batches} onChange={(v) => { setBatchId(v); setNewStatus(""); setErrors((e) => ({ ...e, batchId: "" })); }} error={errors.batchId} required placeholder={farmId ? "Select batch…" : "Select farm first"} />
      </FormCard>

      {currentStatus ? (
        <FormCard label="STATUS CHANGE">
          <View style={styles.currentRow}>
            <Text style={styles.currentLabel}>Current Status</Text>
            <View style={[styles.badge, { backgroundColor: (STATUS_COLORS[currentStatus] ?? "#6B7280") + "20" }]}>
              <Text style={[styles.badgeText, { color: STATUS_COLORS[currentStatus] ?? "#6B7280" }]}>{currentStatus}</Text>
            </View>
          </View>
          {validTransitions.length > 0 ? (
            <SelectField
              label="New Status"
              value={newStatus}
              options={transitionOptions}
              onChange={(v) => { setNewStatus(v); setErrors((e) => ({ ...e, newStatus: "" })); }}
              error={errors.newStatus}
              required
              placeholder="Select next status…"
            />
          ) : (
            <View style={styles.terminalNote}>
              <MaterialCommunityIcons name="lock" size={14} color={colors.inkLight} />
              <Text style={styles.terminalText}>This batch is in a terminal state — no further transitions allowed.</Text>
            </View>
          )}
          <FormField
            label="Notes (optional)"
            value={notes}
            onChangeText={setNotes}
            multiline
            numberOfLines={2}
            style={{ minHeight: 70, textAlignVertical: "top" } as any}
            placeholder="Reason for status change…"
          />
        </FormCard>
      ) : null}
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
  currentRow:   { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  currentLabel: { fontSize: font.size.sm, fontFamily: font.family.semibold, color: colors.inkMid },
  badge:        { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  badgeText:    { fontSize: font.size.xs, fontFamily: font.family.bold, textTransform: "uppercase" },
  terminalNote: { flexDirection: "row", alignItems: "center", gap: spacing.sm, padding: spacing.md, backgroundColor: colors.bg, borderRadius: 8 },
  terminalText: { fontSize: font.size.sm, color: colors.inkLight, fontFamily: font.family.regular, flex: 1 },
});
