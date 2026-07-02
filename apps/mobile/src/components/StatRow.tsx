import { StyleSheet, Text, View } from "react-native";
import { font, radius, spacing } from "../constants/theme";

export type StatItem = {
  label: string;
  value: string | number;
  color: string;
  bg: string;
  border?: string;
};

type Props = { items: StatItem[] };

export function StatRow({ items }: Props) {
  return (
    <View style={styles.row}>
      {items.map((item) => (
        <View
          key={item.label}
          style={[styles.chip, { backgroundColor: item.bg, borderColor: item.border ?? item.color + "40" }]}
        >
          <Text style={[styles.value, { color: item.color }]}>{String(item.value)}</Text>
          <Text style={styles.label}>{item.label}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row:   { flexDirection: "row", gap: spacing.sm },
  chip:  { flex: 1, alignItems: "center", paddingVertical: spacing.md, borderRadius: radius.lg, borderWidth: 1, gap: 2 },
  value: { fontSize: font.size.xl, fontFamily: font.family.extrabold },
  label: { fontSize: font.size.xs, fontFamily: font.family.medium, color: "#64748b" },
});
