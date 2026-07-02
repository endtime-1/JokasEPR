import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Icon, type IconName } from "./Icon";
import { colors, font, radius, shadow, spacing } from "../constants/theme";

type Props = {
  icon: IconName;
  title: string;
  subtitle?: string;
  actionLabel?: string;
  onAction?: () => void;
  iconColor?: string;
};

export function EmptyState({ icon, title, subtitle, actionLabel, onAction, iconColor = colors.brand }: Props) {
  return (
    <View style={styles.wrap}>
      <View style={[styles.iconWrap, { backgroundColor: iconColor + "18" }]}>
        <Icon name={icon} size={36} color={iconColor} />
      </View>
      <Text style={styles.title}>{title}</Text>
      {subtitle ? <Text style={styles.sub}>{subtitle}</Text> : null}
      {actionLabel && onAction ? (
        <TouchableOpacity style={styles.btn} onPress={onAction} activeOpacity={0.8}>
          <Text style={styles.btnText}>{actionLabel}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap:    { alignItems: "center", paddingVertical: 60, paddingHorizontal: spacing.xxl, gap: spacing.md },
  iconWrap:{ width: 80, height: 80, borderRadius: 40, alignItems: "center", justifyContent: "center", ...shadow.sm },
  title:   { fontSize: font.size.lg, fontFamily: font.family.bold, color: colors.ink, textAlign: "center" },
  sub:     { fontSize: font.size.sm, color: colors.inkLight, fontFamily: font.family.regular, textAlign: "center", lineHeight: 20 },
  btn:     { marginTop: spacing.sm, paddingHorizontal: spacing.xl, paddingVertical: spacing.md, borderRadius: radius.lg, borderWidth: 1.5, borderColor: colors.brand },
  btnText: { fontSize: font.size.sm, fontFamily: font.family.semibold, color: colors.brand },
});
