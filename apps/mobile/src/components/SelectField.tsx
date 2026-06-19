import { Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useState } from "react";
import { colors, font, radius, spacing } from "../constants/theme";

export type SelectOption = { label: string; value: string };

type Props = {
  label: string;
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
  error?: string;
  placeholder?: string;
  required?: boolean;
};

export function SelectField({ label, value, options, onChange, error, placeholder = "Select…", required }: Props) {
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.value === value);

  return (
    <View style={styles.wrapper}>
      <Text style={styles.label}>
        {label}
        {required && <Text style={styles.required}> *</Text>}
      </Text>
      <TouchableOpacity
        onPress={() => setOpen(true)}
        style={[styles.trigger, error && styles.triggerError]}
        activeOpacity={0.8}
      >
        <Text style={[styles.triggerText, !selected && styles.placeholder]}>
          {selected ? selected.label : placeholder}
        </Text>
        <Text style={styles.caret}>▾</Text>
      </TouchableOpacity>
      {error && <Text style={styles.error}>{error}</Text>}

      <Modal visible={open} transparent animationType="fade">
        <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={() => setOpen(false)}>
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>{label}</Text>
            <ScrollView>
              {options.map((o) => (
                <TouchableOpacity
                  key={o.value}
                  style={[styles.option, o.value === value && styles.optionSelected]}
                  onPress={() => { onChange(o.value); setOpen(false); }}
                >
                  <Text style={[styles.optionText, o.value === value && styles.optionTextSelected]}>{o.label}</Text>
                  {o.value === value && <Text style={styles.checkmark}>✓</Text>}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { gap: 5 },
  label: { fontSize: font.size.sm, fontWeight: font.weight.semibold, color: colors.ink },
  required: { color: colors.error },
  trigger: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.bgCard
  },
  triggerError: { borderColor: colors.error },
  triggerText: { fontSize: font.size.md, color: colors.ink, flex: 1 },
  placeholder: { color: colors.inkLight },
  caret: { color: colors.inkLight, fontSize: 12 },
  error: { fontSize: font.size.xs, color: colors.error },
  overlay: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: "flex-end"
  },
  sheet: {
    backgroundColor: colors.bgCard,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    padding: spacing.xl,
    maxHeight: "60%"
  },
  sheetTitle: {
    fontSize: font.size.lg,
    fontWeight: font.weight.bold,
    color: colors.ink,
    marginBottom: spacing.md
  },
  option: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.sm,
    marginBottom: 2
  },
  optionSelected: { backgroundColor: colors.brandLight },
  optionText: { flex: 1, fontSize: font.size.md, color: colors.ink },
  optionTextSelected: { color: colors.brand, fontWeight: font.weight.semibold },
  checkmark: { color: colors.brand, fontSize: 16 }
});
