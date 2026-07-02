import { StyleSheet, Text, View } from "react-native";
import { font, radius, spacing } from "../constants/theme";

type Size = "xs" | "sm" | "md";

type Props = {
  label: string;
  color: string;
  bg: string;
  border?: string;
  size?: Size;
};

export function Badge({ label, color, bg, border, size = "sm" }: Props) {
  return (
    <View
      style={[
        styles.base,
        { backgroundColor: bg, borderColor: border ?? color + "40" },
        size === "xs" && styles.xs,
        size === "md" && styles.md,
      ]}
    >
      <Text
        style={[
          styles.text,
          { color },
          size === "xs" && styles.textXs,
          size === "md" && styles.textMd,
        ]}
      >
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  base:    { paddingHorizontal: spacing.sm, paddingVertical: 3, borderRadius: radius.full, borderWidth: 1 },
  xs:      { paddingHorizontal: 5, paddingVertical: 1 },
  md:      { paddingHorizontal: spacing.md, paddingVertical: 5 },
  text:    { fontSize: font.size.xs, fontFamily: font.family.bold },
  textXs:  { fontSize: 9 },
  textMd:  { fontSize: font.size.sm },
});
