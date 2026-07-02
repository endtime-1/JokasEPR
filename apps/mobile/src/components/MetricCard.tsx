import { StyleSheet, Text, View } from "react-native";
import { Icon, type IconName } from "./Icon";
import { colors, font, radius, shadow, spacing } from "../constants/theme";

type Trend = { direction: "up" | "down" | "flat"; text: string };

type Props = {
  icon: IconName;
  value: string;
  label: string;
  color: string;
  trend?: Trend;
};

export function MetricCard({ icon, value, label, color, trend }: Props) {
  const trendColor =
    trend?.direction === "up"   ? "#16a34a" :
    trend?.direction === "down" ? "#dc2626" : "#64748b";
  const trendIcon: IconName =
    trend?.direction === "up"   ? "trending-up"   :
    trend?.direction === "down" ? "trending-down" : "minus";

  return (
    <View style={styles.card}>
      <View style={[styles.iconWrap, { backgroundColor: color + "18" }]}>
        <Icon name={icon} size={24} color={color} />
      </View>
      <Text style={[styles.value, { color }]}>{value}</Text>
      <Text style={styles.label}>{label}</Text>
      {trend && (
        <View style={styles.trend}>
          <Icon name={trendIcon} size={12} color={trendColor} />
          <Text style={[styles.trendText, { color: trendColor }]}>{trend.text}</Text>
        </View>
      )}
      <View style={[styles.accent, { backgroundColor: color }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1, minWidth: "44%",
    backgroundColor: colors.bgCard,
    borderRadius: radius.xl, borderWidth: 1, borderColor: colors.border,
    padding: spacing.lg, gap: spacing.sm, overflow: "hidden", ...shadow.md,
  },
  iconWrap:  { width: 48, height: 48, borderRadius: radius.md, alignItems: "center", justifyContent: "center" },
  value:     { fontSize: font.size.xxl, fontFamily: font.family.extrabold },
  label:     { fontSize: font.size.sm, fontFamily: font.family.medium, color: colors.inkMid },
  trend:     { flexDirection: "row", alignItems: "center", gap: 3 },
  trendText: { fontSize: font.size.xs, fontFamily: font.family.semibold },
  accent:    { position: "absolute", bottom: 0, left: 0, right: 0, height: 3, borderBottomLeftRadius: radius.xl, borderBottomRightRadius: radius.xl },
});
