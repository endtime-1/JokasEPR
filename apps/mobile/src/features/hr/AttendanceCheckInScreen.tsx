import { useState } from "react";
import { Alert, StyleSheet, Text, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
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

      <View style={styles.dateChip}>
        <Text style={styles.dateChipText}>📅  {todayISO()}</Text>
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
  pageHeader:   { flexDirection: "row", alignItems: "center", gap: 12 },
  pageIconWrap: {
    width: 48, height: 48, borderRadius: 12,
    backgroundColor: colors.brandLight,
    borderWidth: 1, borderColor: colors.brandMid,
    alignItems: "center", justifyContent: "center",
  },
  title: { fontSize: font.size.xl, fontFamily: font.family.extrabold, color: colors.ink },
  sub:   { fontSize: font.size.sm, color: colors.inkMid, fontFamily: font.family.regular },

  dateChip:     { paddingVertical: spacing.sm, paddingHorizontal: spacing.md, backgroundColor: "#f0fdf4", borderRadius: radius.md, alignSelf: "flex-start" },
  dateChipText: { fontSize: font.size.sm, color: "#16a34a", fontWeight: font.weight.semibold as any },
});
