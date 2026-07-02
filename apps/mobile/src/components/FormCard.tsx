import { StyleSheet, Text, View } from "react-native";
import { colors, font, radius, shadow, spacing } from "../constants/theme";

type Props = {
  label?: string;
  children: React.ReactNode;
};

export function FormCard({ label, children }: Props) {
  return (
    <View style={styles.card}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.bgCard,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.md,
    ...shadow.sm,
  },
  label: {
    fontSize: font.size.xs,
    fontFamily: font.family.bold,
    color: colors.inkLight,
    letterSpacing: 1.2,
    textTransform: "uppercase",
  },
});
