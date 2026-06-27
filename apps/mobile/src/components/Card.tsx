import { StyleSheet, View, ViewProps } from "react-native";
import { colors, radius, shadow, spacing } from "../constants/theme";

type Props = ViewProps & {
  padded?: boolean;
  elevated?: boolean;
  variant?: "default" | "brand" | "flat";
};

export function Card({ style, padded = true, elevated = true, variant = "default", ...rest }: Props) {
  return (
    <View
      style={[
        styles.card,
        elevated && shadow.md,
        padded && styles.padded,
        variant === "brand" && styles.brandCard,
        variant === "flat" && styles.flatCard,
        style as any
      ]}
      {...rest}
    />
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.bgCard,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  padded: { padding: spacing.lg },
  brandCard: {
    backgroundColor: colors.brand,
    borderColor: colors.brandDark,
  },
  flatCard: {
    borderWidth: 0,
    backgroundColor: colors.surface,
  }
});
