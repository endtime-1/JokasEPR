import { StyleSheet, Text, TextInput, TextInputProps, View } from "react-native";
import { colors, font, radius, spacing } from "../constants/theme";

type Props = TextInputProps & {
  label: string;
  error?: string;
  hint?: string;
  required?: boolean;
};

export function FormField({ label, error, hint, required, style, ...rest }: Props) {
  return (
    <View style={styles.wrapper}>
      <Text style={styles.label}>
        {label}
        {required && <Text style={styles.required}> *</Text>}
      </Text>
      <TextInput
        style={[styles.input, error && styles.inputError, style as any]}
        placeholderTextColor={colors.inkLight}
        {...rest}
      />
      {hint && !error && <Text style={styles.hint}>{hint}</Text>}
      {error && <Text style={styles.error}>{error}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { gap: 5 },
  label: {
    fontSize: font.size.sm,
    fontWeight: font.weight.semibold,
    color: colors.ink
  },
  required: { color: colors.error },
  input: {
    minHeight: 44,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.bgCard,
    fontSize: font.size.md,
    color: colors.ink
  },
  inputError: { borderColor: colors.error },
  hint: { fontSize: font.size.xs, color: colors.inkLight },
  error: { fontSize: font.size.xs, color: colors.error }
});
