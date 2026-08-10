import { useState } from "react";
import { Platform, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { colors, font, radius, spacing } from "../constants/theme";

type Props = {
  label: string;
  value: string; // "YYYY-MM-DD", matching the string form-state used across every screen
  onChangeText: (value: string) => void;
  error?: string;
  hint?: string;
  required?: boolean;
  placeholder?: string;
  minimumDate?: Date;
  maximumDate?: Date;
};

function toISODate(d: Date) {
  return d.toISOString().split("T")[0];
}

function parseISODate(value: string): Date {
  if (!value) return new Date();
  const parsed = new Date(`${value}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

function formatDisplay(value: string) {
  if (!value) return "";
  const d = parseISODate(value);
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export function DateField({
  label,
  value,
  onChangeText,
  error,
  hint,
  required,
  placeholder = "Select date",
  minimumDate,
  maximumDate,
}: Props) {
  const [open, setOpen] = useState(false);

  function handleChange(event: { type: string }, selected?: Date) {
    // Android fires "dismissed" on cancel; the picker also closes itself there.
    if (Platform.OS === "android") setOpen(false);
    if (event.type === "dismissed" || !selected) return;
    onChangeText(toISODate(selected));
    if (Platform.OS === "ios") setOpen(false);
  }

  return (
    <View style={styles.wrapper}>
      <Text style={styles.label}>
        {label}
        {required && <Text style={styles.required}> *</Text>}
      </Text>
      <TouchableOpacity
        style={[styles.input, error && styles.inputError]}
        onPress={() => setOpen(true)}
        activeOpacity={0.7}
      >
        <MaterialCommunityIcons name="calendar-outline" size={18} color={colors.inkLight} />
        <Text style={value ? styles.valueText : styles.placeholderText}>
          {value ? formatDisplay(value) : placeholder}
        </Text>
      </TouchableOpacity>
      {hint && !error && <Text style={styles.hint}>{hint}</Text>}
      {error && <Text style={styles.errorText}>{error}</Text>}

      {open && (
        <DateTimePicker
          value={parseISODate(value)}
          mode="date"
          display={Platform.OS === "ios" ? "inline" : "default"}
          onChange={handleChange}
          minimumDate={minimumDate}
          maximumDate={maximumDate}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { gap: 6 },
  label: {
    fontSize: font.size.sm,
    fontWeight: font.weight.semibold,
    color: colors.inkMid,
    letterSpacing: 0.1
  },
  required: { color: colors.brandDark },
  input: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    minHeight: 48,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.bgCard,
  },
  inputError: { borderColor: colors.error },
  valueText: { fontSize: font.size.md, color: colors.ink },
  placeholderText: { fontSize: font.size.md, color: colors.inkLight },
  hint: { fontSize: font.size.xs, color: colors.inkLight },
  errorText: { fontSize: font.size.xs, color: colors.error, fontWeight: font.weight.medium }
});
