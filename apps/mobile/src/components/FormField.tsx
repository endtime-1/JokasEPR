import { useState } from "react";
import { StyleSheet, Text, TextInput, TextInputProps, View } from "react-native";
import { colors, font, radius, spacing } from "../constants/theme";

type Props = TextInputProps & {
  label: string;
  error?: string;
  hint?: string;
  required?: boolean;
};

export function FormField({ label, error, hint, required, style, ...rest }: Props) {
  const [focused, setFocused] = useState(false);

  return (
    <View style={styles.wrapper}>
      <Text style={styles.label}>
        {label}
        {required && <Text style={styles.required}> *</Text>}
      </Text>
      <TextInput
        style={[
          styles.input,
          focused && styles.inputFocused,
          error && styles.inputError,
          style as any
        ]}
        placeholderTextColor={colors.inkLight}
        onFocus={(e) => { setFocused(true); rest.onFocus?.(e); }}
        onBlur={(e) => { setFocused(false); rest.onBlur?.(e); }}
        {...rest}
      />
      {hint && !error && <Text style={styles.hint}>{hint}</Text>}
      {error && <Text style={styles.errorText}>{error}</Text>}
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
  required: { color: colors.brand },
  input: {
    minHeight: 48,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.bgCard,
    fontSize: font.size.md,
    color: colors.ink
  },
  inputFocused: {
    borderColor: colors.brand,
    backgroundColor: colors.white,
  },
  inputError: { borderColor: colors.error },
  hint: { fontSize: font.size.xs, color: colors.inkLight },
  errorText: { fontSize: font.size.xs, color: colors.error, fontWeight: font.weight.medium }
});
