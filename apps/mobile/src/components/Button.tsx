import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, TouchableOpacityProps } from "react-native";
import { colors, font, radius, shadow, spacing } from "../constants/theme";

type Props = TouchableOpacityProps & {
  label: string;
  loading?: boolean;
  variant?: "primary" | "secondary" | "danger" | "ghost" | "outline";
  size?: "sm" | "md" | "lg";
};

export function Button({ label, loading, variant = "primary", size = "md", disabled, style, ...rest }: Props) {
  const isPrimary = variant === "primary";
  const isDanger = variant === "danger";
  const isGhost = variant === "ghost";
  const isOutline = variant === "outline";

  const bg = isPrimary ? colors.brand
    : isDanger ? colors.error
    : isGhost || isOutline ? "transparent"
    : colors.bgCard;

  const labelColor = isPrimary || isDanger ? colors.white
    : isGhost || isOutline ? colors.brand
    : colors.ink;

  const minH = size === "sm" ? 38 : size === "lg" ? 54 : 46;
  const textSize = size === "sm" ? font.size.sm : size === "lg" ? font.size.md : font.size.md;
  const px = size === "sm" ? spacing.md : size === "lg" ? spacing.xl : spacing.lg;

  return (
    <TouchableOpacity
      activeOpacity={0.82}
      disabled={disabled || loading}
      style={[
        styles.base,
        { backgroundColor: bg, minHeight: minH, paddingHorizontal: px },
        isPrimary && shadow.brand,
        isOutline && styles.outlineBorder,
        variant === "secondary" && styles.secondaryBorder,
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
    borderRadius: radius.full,
    alignItems: "center",
    justifyContent: "center",
  },
  outlineBorder: {
    borderWidth: 1.5,
    borderColor: colors.brand,
  },
  secondaryBorder: {
    borderWidth: 1,
    borderColor: colors.border,
  },
  disabled: { opacity: 0.45 },
  label: { fontWeight: font.weight.bold, letterSpacing: 0.2 }
});
