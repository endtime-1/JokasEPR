import { useEffect, useState } from "react";
import { Alert, StyleSheet, Text, View } from "react-native";
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

const STATUS_OPTIONS: SelectOption[] = [
  { label: "✅  Present",     value: "PRESENT"       },
  { label: "⏰  Late",        value: "LATE"           },
  { label: "🌓  Half Day",    value: "HALF_DAY"       },
  { label: "🏠  On Leave",    value: "ON_LEAVE"       },
  { label: "❌  Absent",      value: "ABSENT"         },
];

type GeoState = "idle" | "capturing" | "captured" | "unavailable";

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export function AttendanceCheckInScreen() {
  const navigation = useNavigation<any>();
  const [status, setStatus]          = useState("PRESENT");
  const [overtimeHours, setOvertime] = useState("");
  const [notes, setNotes]            = useState("");
  const [geoState, setGeoState]      = useState<GeoState>("idle");
  const [geoLat, setGeoLat]          = useState<number | undefined>();
  const [geoLon, setGeoLon]          = useState<number | undefined>();

  const { submit, loading } = useSubmit({
    module:   "hr_attendance",
    endpoint: "/hr/attendance/me",
    onSuccess: () =>
      Alert.alert("Attendance Recorded", "Your check-in has been logged for today.", [
        { text: "OK", onPress: () => navigation.goBack() },
      ]),
  });

  useEffect(() => {
    captureLocation();
  }, []);

  async function captureLocation() {
    setGeoState("capturing");
    try {
      const { status: perm } = await Location.requestForegroundPermissionsAsync();
      if (perm !== "granted") { setGeoState("unavailable"); return; }
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      setGeoLat(loc.coords.latitude);
      setGeoLon(loc.coords.longitude);
      setGeoState("captured");
    } catch {
      setGeoState("unavailable");
    }
  }

  function handleSubmit() {
    const checkInTime = new Date().toISOString();
    const ot = parseFloat(overtimeHours);
    void submit({
      date: todayISO(),
      status,
      checkInTime,
      overtimeHours: !isNaN(ot) && ot > 0 ? ot : undefined,
      geoLat,
      geoLon,
      notes: notes.trim() || undefined,
    });
  }

  const geoColor = geoState === "captured" ? "#16a34a" : geoState === "unavailable" ? colors.inkMid : colors.brand;
  const geoIcon  = geoState === "captured" ? "map-marker-check" : geoState === "unavailable" ? "map-marker-off" : "map-marker-radius";
  const geoLabel = geoState === "captured" ? "Location: Captured" : geoState === "capturing" ? "Location: Capturing…" : "Location: Unavailable";

  return (
    <ScreenWrapper footer={<FormFooter saveLabel="Record Check-In" onSave={handleSubmit} loading={loading} />}>
      <View style={styles.pageHeader}>
        <View style={styles.pageIconWrap}>
          <MaterialCommunityIcons name="account-clock" size={22} color={colors.brand} />
        </View>
        <View>
          <Text style={styles.title}>Attendance Check-In</Text>
          <Text style={styles.sub}>Log your attendance for today</Text>
        </View>
      </View>

      <View style={styles.metaRow}>
        <View style={styles.dateChip}>
          <Text style={styles.dateChipText}>📅  {todayISO()}</Text>
        </View>
        <View style={[styles.geoChip, geoState === "unavailable" && styles.geoChipWarn]}>
          <MaterialCommunityIcons name={geoIcon as any} size={14} color={geoColor} />
          <Text style={[styles.geoChipText, { color: geoColor }]}>{geoLabel}</Text>
        </View>
      </View>

      <FormCard label="ATTENDANCE">
        <SelectField
          label="Attendance Status"
          options={STATUS_OPTIONS}
          value={status}
          onChange={setStatus}
          required
        />
      </FormCard>

      <FormCard label="OVERTIME">
        <FormField
          label="Overtime Hours (optional)"
          value={overtimeHours}
          onChangeText={setOvertime}
          placeholder="e.g. 2.5"
          keyboardType="decimal-pad"
        />
      </FormCard>

      <FormCard label="NOTES">
        <FormField
          label="Notes (optional)"
          value={notes}
          onChangeText={setNotes}
          placeholder="Any remarks or reason for late arrival..."
          multiline
          numberOfLines={3}
        />
      </FormCard>
    </ScreenWrapper>
  );
}

const styles = StyleSheet.create({
  pageHeader:    { flexDirection: "row", alignItems: "center", gap: 12 },
  pageIconWrap:  {
    width: 48, height: 48, borderRadius: 12,
    backgroundColor: colors.brandLight,
    borderWidth: 1, borderColor: colors.brandMid,
    alignItems: "center", justifyContent: "center",
  },
  title: { fontSize: font.size.xl, fontFamily: font.family.extrabold, color: colors.ink },
  sub:   { fontSize: font.size.sm, color: colors.inkMid, fontFamily: font.family.regular },

  metaRow:      { flexDirection: "row", gap: spacing.sm, flexWrap: "wrap" },
  dateChip:     { paddingVertical: spacing.sm, paddingHorizontal: spacing.md, backgroundColor: "#f0fdf4", borderRadius: radius.md },
  dateChipText: { fontSize: font.size.sm, color: "#16a34a", fontWeight: font.weight.semibold as any },
  geoChip:      { flexDirection: "row", alignItems: "center", gap: 4, paddingVertical: spacing.sm, paddingHorizontal: spacing.md, backgroundColor: colors.brandLight, borderRadius: radius.md },
  geoChipWarn:  { backgroundColor: "#f5f5f5" },
  geoChipText:  { fontSize: font.size.sm, fontWeight: font.weight.semibold as any },
});
