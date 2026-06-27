import { useState } from "react";
import { Alert, StyleSheet, Text, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { ScreenWrapper } from "../../components/ScreenWrapper";
import { FormField } from "../../components/FormField";
import { SelectField, SelectOption } from "../../components/SelectField";
import { Button } from "../../components/Button";
import { useSubmit } from "../../hooks/useSubmit";
import { colors, font, radius, spacing } from "../../constants/theme";

const STATUS_OPTIONS: SelectOption[] = [
  { label: "✅  Present",     value: "PRESENT"       },
  { label: "⏰  Late",        value: "LATE"           },
  { label: "🌓  Half Day",    value: "HALF_DAY"       },
  { label: "🏠  On Leave",    value: "ON_LEAVE"       },
  { label: "❌  Absent",      value: "ABSENT"         },
];

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export function AttendanceCheckInScreen() {
  const navigation = useNavigation<any>();
  const [status, setStatus] = useState("PRESENT");
  const [notes, setNotes]   = useState("");

  const { submit, loading } = useSubmit({
    module:   "hr_attendance",
    endpoint: "/hr/attendance/me",
    onSuccess: () =>
      Alert.alert("Attendance Recorded", "Your check-in has been logged for today.", [
        { text: "OK", onPress: () => navigation.goBack() },
      ]),
  });

  function handleSubmit() {
    const checkInTime = new Date().toISOString();
    void submit({ date: todayISO(), status, checkInTime, notes: notes.trim() || undefined });
  }

  return (
    <ScreenWrapper>
      <View style={styles.pageHeader}>
        <View style={styles.iconWrap}>
          <Text style={styles.iconText}>🗓️</Text>
        </View>
        <View>
          <Text style={styles.pageTitle}>Attendance Check-In</Text>
          <Text style={styles.pageSub}>Log your attendance for today</Text>
        </View>
      </View>

      <View style={styles.dateChip}>
        <Text style={styles.dateChipText}>📅  {todayISO()}</Text>
      </View>

      <View style={styles.section}>
        <SelectField
          label="Attendance Status"
          options={STATUS_OPTIONS}
          value={status}
          onChange={setStatus}
          required
        />

        <FormField
          label="Notes (optional)"
          value={notes}
          onChangeText={setNotes}
          placeholder="Any remarks or reason for late arrival..."
          multiline
          numberOfLines={3}
        />
      </View>

      <View style={styles.actions}>
        <Button
          label={loading ? "Saving..." : "Record Check-In"}
          onPress={handleSubmit}
          disabled={loading}
        />
      </View>
    </ScreenWrapper>
  );
}

const styles = StyleSheet.create({
  pageHeader: { flexDirection: "row", alignItems: "center", gap: spacing.md, marginBottom: spacing.lg, paddingHorizontal: spacing.lg },
  iconWrap:   { width: 52, height: 52, borderRadius: radius.xl, backgroundColor: "#dbeafe", alignItems: "center", justifyContent: "center" },
  iconText:   { fontSize: 26 },
  pageTitle:  { fontSize: font.size.xl, fontWeight: font.weight.bold as any, color: colors.ink },
  pageSub:    { fontSize: font.size.sm, color: colors.inkLight, marginTop: 2 },
  dateChip:   { marginHorizontal: spacing.lg, marginBottom: spacing.lg, paddingVertical: spacing.sm, paddingHorizontal: spacing.md, backgroundColor: "#f0fdf4", borderRadius: radius.md, alignSelf: "flex-start" },
  dateChipText: { fontSize: font.size.sm, color: "#16a34a", fontWeight: font.weight.semibold as any },
  section:    { paddingHorizontal: spacing.lg, gap: spacing.md },
  actions:    { marginTop: spacing.xl, paddingHorizontal: spacing.lg },
});
