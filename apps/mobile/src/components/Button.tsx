import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, TouchableOpacityProps } from "react-native";
import { colors, font, radius, spacing } from "../constants/theme";

type Props = TouchableOpacityProps & {
  label: string;
  loading?: boolean;
  variant?: "primary" | "secondary" | "danger" | "ghost";
  size?: "sm" | "md" | "lg";
};

export function Button({ label, loading, variant = "primary", size = "md", disabled, style, ...rest }: Props) {
  const bg = variant === "primary" ? colors.brand
    : variant === "danger" ? colors.error
    : variant === "secondary" ? colors.bgCard
    : "transparent";

  const labelColor = variant === "primary" || variant === "danger" ? "#fff"
    : variant === "ghost" ? colors.brand
    : colors.ink;

  const minH = size === "sm" ? 36 : size === "lg" ? 52 : 44;
  const textSize = size === "sm" ? font.size.sm : size === "lg" ? font.size.lg : font.size.md;

  return (
    <TouchableOpacity
      activeOpacity={0.8}
      disabled={disabled || loading}
      style={[
        styles.base,
        { backgroundColor: bg, minHeight: minH },
        variant === "secondary" && styles.outlined,
        (disabled || loading) && styles.disabled,
        style as any
      ]}
      {...rest}
    >
      {loading ? (
        <ActivityIndicator size="small" color={labelColor} />
      ) : (
        <Text style={[styles.label, { color: labelColor, fontSize: textSize }]}>{label}</Text>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.lg,
  },
  outlined: {
    borderWidth: 1,
    borderColor: colors.border
  },
  disabled: {
    opacity: 0.5
  },
  label: {
    fontWeight: font.weight.bold
  }
});
