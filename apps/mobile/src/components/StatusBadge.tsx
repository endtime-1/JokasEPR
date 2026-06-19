import { StyleSheet, Text, View } from "react-native";
import { colors, font, radius, spacing } from "../constants/theme";

type Variant = "success" | "warning" | "error" | "info" | "default";

type Props = { label: string; variant?: Variant };

const STYLES: Record<Variant, { bg: string; text: string }> = {
  success: { bg: colors.successBg, text: colors.success },
  warning: { bg: colors.warningBg, text: colors.warning },
  error: { bg: colors.errorBg, text: colors.error },
  info: { bg: colors.infoBg, text: colors.info },
  default: { bg: colors.bg, text: colors.inkMid }
};

export function StatusBadge({ label, variant = "default" }: Props) {
  const s = STYLES[variant];
  return (
    <View style={[styles.badge, { backgroundColor: s.bg }]}>
      <Text style={[styles.text, { color: s.text }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radius.full,
    alignSelf: "flex-start"
  },
  text: { fontSize: font.size.xs, fontWeight: font.weight.semibold }
});
