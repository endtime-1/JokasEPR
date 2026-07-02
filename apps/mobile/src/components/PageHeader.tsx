import { type ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Icon, type IconName } from "./Icon";
import { colors, font, radius, spacing } from "../constants/theme";

type Props = {
  icon: IconName;
  title: string;
  subtitle?: string;
  iconColor?: string;
  right?: ReactNode;
};

export function PageHeader({ icon, title, subtitle, iconColor = colors.brand, right }: Props) {
  return (
    <View style={styles.row}>
      <View style={styles.iconWrap}>
        <Icon name={icon} size={26} color={iconColor} />
      </View>
      <View style={styles.text}>
        <Text style={styles.title}>{title}</Text>
        {subtitle ? <Text style={styles.sub}>{subtitle}</Text> : null}
      </View>
      {right ?? null}
    </View>
  );
}

const styles = StyleSheet.create({
  row:     { flexDirection: "row", alignItems: "center", gap: spacing.md },
  iconWrap:{ width: 52, height: 52, borderRadius: radius.lg, backgroundColor: colors.brandLight, borderWidth: 1, borderColor: colors.brandMid, alignItems: "center", justifyContent: "center" },
  text:    { flex: 1, gap: 2 },
  title:   { fontSize: font.size.xl, fontFamily: font.family.extrabold, color: colors.ink },
  sub:     { fontSize: font.size.sm, color: colors.inkLight, fontFamily: font.family.regular },
});
