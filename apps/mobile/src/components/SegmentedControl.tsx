import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Icon, type IconName } from "./Icon";
import { colors, font, radius, spacing } from "../constants/theme";

export type Segment = { key: string; label: string; icon?: IconName; badge?: number };

type Props = {
  segments: Segment[];
  active: string;
  onChange: (key: string) => void;
};

export function SegmentedControl({ segments, active, onChange }: Props) {
  return (
    <View style={styles.wrap}>
      {segments.map((seg) => {
        const isActive = seg.key === active;
        return (
          <TouchableOpacity
            key={seg.key}
            style={[styles.seg, isActive && styles.segActive]}
            onPress={() => onChange(seg.key)}
            activeOpacity={0.8}
          >
            {seg.icon ? <Icon name={seg.icon} size={14} color={isActive ? colors.white : colors.inkLight} /> : null}
            <Text style={[styles.label, isActive && styles.labelActive]}>{seg.label}</Text>
            {seg.badge !== undefined && seg.badge > 0 ? (
              <View style={[styles.badge, isActive && styles.badgeActive]}>
                <Text style={[styles.badgeText, isActive && styles.badgeTextActive]}>{seg.badge}</Text>
              </View>
            ) : null}
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap:         { flexDirection: "row", backgroundColor: colors.bgCard, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: 4, gap: 4 },
  seg:          { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", paddingVertical: 8, borderRadius: radius.md, gap: 5 },
  segActive:    { backgroundColor: colors.brand },
  label:        { fontSize: font.size.sm, fontFamily: font.family.semibold, color: colors.inkLight },
  labelActive:  { color: colors.white },
  badge:        { minWidth: 18, height: 18, borderRadius: 9, backgroundColor: colors.border, alignItems: "center", justifyContent: "center", paddingHorizontal: 4 },
  badgeActive:  { backgroundColor: "rgba(255,255,255,0.3)" },
  badgeText:    { fontSize: 9, fontFamily: font.family.bold, color: colors.inkMid },
  badgeTextActive: { color: colors.white },
});
