import { useEffect, useState } from "react";
import { Alert, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import * as Location from "expo-location";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { ScreenWrapper } from "../../components/ScreenWrapper";
import { FormCard } from "../../components/FormCard";
import { FormFooter } from "../../components/FormFooter";
import { FormField } from "../../components/FormField";
import { SelectField, SelectOption } from "../../components/SelectField";
import { useSubmit } from "../../hooks/useSubmit";
import { colors, font, radius, spacing } from "../../constants/theme";

const VISIT_TYPE_OPTIONS: SelectOption[] = [
  { label: "📞  Cold Call",      value: "COLD_CALL"    },
  { label: "🤝  Referral",       value: "REFERRAL"     },
  { label: "🔄  Follow-Up",      value: "FOLLOW_UP"    },
  { label: "🎯  Demo / Pitch",   value: "DEMO"         },
  { label: "♻️  Reactivation",   value: "REACTIVATION" },
];

const OUTCOME_OPTIONS: SelectOption[] = [
  { label: "✅  Interested",          value: "INTERESTED"      },
  { label: "🔁  Follow-Up Needed",    value: "FOLLOW_UP_NEEDED"},
  { label: "🎉  Converted",           value: "CONVERTED"       },
  { label: "📵  No Answer",           value: "NO_ANSWER"       },
  { label: "❌  Not Interested",      value: "NOT_INTERESTED"  },
];

const OUTCOME_COLORS: Record<string, { color: string; bg: string }> = {
  INTERESTED:       { color: "#16a34a", bg: "#dcfce7" },
  FOLLOW_UP_NEEDED: { color: "#d97706", bg: "#fef3c7" },
  CONVERTED:        { color: "#7c3aed", bg: "#ede9fe" },
  NO_ANSWER:        { color: "#6b7280", bg: "#f3f4f6" },
  NOT_INTERESTED:   { color: "#dc2626", bg: "#fee2e2" },
};

type GpsState = { lat: number; lng: number } | null;

export function ProspectVisitScreen() {
  const navigation = useNavigation<any>();

  const [prospectName, setProspectName] = useState("");
  const [phone,        setPhone]        = useState("");
  const [address,      setAddress]      = useState("");
  const [visitType,    setVisitType]    = useState("COLD_CALL");
  const [outcome,      setOutcome]      = useState("INTERESTED");
  const [notes,        setNotes]        = useState("");
  const [errors,       setErrors]       = useState<Record<string, string>>({});

  const [gps,       setGps]       = useState<GpsState>(null);
  const [gpsStatus, setGpsStatus] = useState<"idle" | "loading" | "ok" | "denied">("idle");

  // Attempt to get location on mount
  useEffect(() => {
    void captureLocation();
  }, []);

  async function captureLocation() {
    setGpsStatus("loading");
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") { setGpsStatus("denied"); return; }
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      setGps({ lat: loc.coords.latitude, lng: loc.coords.longitude });
      setGpsStatus("ok");
    } catch {
      setGpsStatus("denied");
    }
  }

  const { submit, loading } = useSubmit({
    module:   "prospect_visit",
    endpoint: "/sales/prospect-visits",
    onSuccess: () =>
      Alert.alert("Visit Logged", "Prospect visit has been recorded.", [
        { text: "Log Another", onPress: () => resetForm() },
        { text: "Done", onPress: () => navigation.goBack() },
      ]),
  });

  function resetForm() {
    setProspectName(""); setPhone(""); setAddress(""); setNotes(""); setErrors({});
    setVisitType("COLD_CALL"); setOutcome("INTERESTED");
    void captureLocation();
  }

  function validate() {
    const e: Record<string, string> = {};
    if (!prospectName.trim()) e.prospectName = "Enter the prospect's name or business";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  function handleSubmit() {
    if (!validate()) return;
    void submit({
      prospectName: prospectName.trim(),
      phone:        phone.trim() || undefined,
      address:      address.trim() || undefined,
      latitude:     gps?.lat,
      longitude:    gps?.lng,
      visitType,
      outcome,
      notes:        notes.trim() || undefined,
      visitedAt:    new Date().toISOString(),
    });
  }

  const outcomeStyle = OUTCOME_COLORS[outcome] ?? OUTCOME_COLORS.INTERESTED;

  return (
    <ScreenWrapper footer={<FormFooter saveLabel="Log Visit" onSave={handleSubmit} loading={loading} />}>
      <View style={styles.pageHeader}>
        <View style={styles.pageIconWrap}>
          <MaterialCommunityIcons name="map-marker-plus" size={22} color={colors.brand} />
        </View>
        <View>
          <Text style={styles.title}>Log Prospect Visit</Text>
          <Text style={styles.sub}>Record a customer prospecting visit</Text>
        </View>
      </View>

      {/* GPS status chip */}
      <TouchableOpacity
        style={[
          styles.gpsChip,
          gpsStatus === "ok"      && styles.gpsChipOk,
          gpsStatus === "denied"  && styles.gpsChipDenied,
          gpsStatus === "loading" && styles.gpsChipLoading,
        ]}
        onPress={captureLocation}
        disabled={gpsStatus === "loading"}
      >
        <Text style={[styles.gpsChipText,
          gpsStatus === "ok"     && { color: "#16a34a" },
          gpsStatus === "denied" && { color: "#dc2626" },
        ]}>
          {gpsStatus === "loading" && "📡  Getting location..."}
          {gpsStatus === "ok"      && `✅  GPS: ${gps?.lat.toFixed(5)}, ${gps?.lng.toFixed(5)}`}
          {gpsStatus === "denied"  && "⚠️  Location denied — tap to retry"}
          {gpsStatus === "idle"    && "📡  Tap to capture location"}
        </Text>
      </TouchableOpacity>

      <FormCard label="PROSPECT DETAILS">
        <FormField
          label="Prospect Name / Business *"
          value={prospectName}
          onChangeText={(v) => { setProspectName(v); setErrors((e) => ({ ...e, prospectName: "" })); }}
          error={errors.prospectName}
          placeholder="e.g. Kusi Poultry Farm"
          required
        />

        <FormField
          label="Phone Number"
          value={phone}
          onChangeText={setPhone}
          placeholder="e.g. 0244123456"
          keyboardType="phone-pad"
        />

        <FormField
          label="Location / Address"
          value={address}
          onChangeText={setAddress}
          placeholder="e.g. Kumasi, Ashanti Region"
        />

        <View style={styles.row}>
          <View style={styles.half}>
            <SelectField
              label="Visit Type"
              options={VISIT_TYPE_OPTIONS}
              value={visitType}
              onChange={setVisitType}
            />
          </View>
          <View style={styles.half}>
            <SelectField
              label="Outcome"
              options={OUTCOME_OPTIONS}
              value={outcome}
              onChange={setOutcome}
            />
          </View>
        </View>

        {/* Outcome badge */}
        <View style={[styles.outcomeBadge, { backgroundColor: outcomeStyle.bg }]}>
          <Text style={[styles.outcomeBadgeText, { color: outcomeStyle.color }]}>
            {OUTCOME_OPTIONS.find((o) => o.value === outcome)?.label}
          </Text>
        </View>
      </FormCard>

      <FormCard label="NOTES">
        <FormField
          label="Notes"
          value={notes}
          onChangeText={setNotes}
          placeholder="What was discussed? Any specific interest or objections..."
          multiline
          numberOfLines={4}
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

  gpsChip:        { paddingVertical: spacing.sm, paddingHorizontal: spacing.md, backgroundColor: "#f3f4f6", borderRadius: radius.md, borderWidth: 1, borderColor: colors.border },
  gpsChipOk:      { backgroundColor: "#f0fdf4", borderColor: "#86efac" },
  gpsChipDenied:  { backgroundColor: "#fff1f2", borderColor: "#fca5a5" },
  gpsChipLoading: { backgroundColor: "#eff6ff", borderColor: "#93c5fd" },
  gpsChipText:    { fontSize: font.size.sm, color: colors.inkLight, fontWeight: font.weight.medium as any },

  row:              { flexDirection: "row", gap: spacing.sm },
  half:             { flex: 1 },
  outcomeBadge:     { paddingVertical: spacing.xs, paddingHorizontal: spacing.md, borderRadius: radius.md, alignSelf: "flex-start" },
  outcomeBadgeText: { fontSize: font.size.sm, fontWeight: font.weight.semibold as any },
});
