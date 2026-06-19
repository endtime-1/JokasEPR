import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { colors, font, spacing } from "../constants/theme";
import { useSync } from "../hooks/useSync";

export function SyncBanner() {
  const { pending, syncing, lastSyncAt, sync, online } = useSync();

  if (pending === 0 && online) return null;

  const bg = !online ? colors.warningBg : syncing ? colors.infoBg : colors.brandLight;
  const textColor = !online ? colors.warning : syncing ? colors.info : colors.brand;

  const label = !online
    ? `Offline · ${pending} record${pending !== 1 ? "s" : ""} pending`
    : syncing
    ? "Syncing…"
    : `${pending} record${pending !== 1 ? "s" : ""} pending sync`;

  return (
    <View style={[styles.banner, { backgroundColor: bg }]}>
      {syncing && <ActivityIndicator size="small" color={textColor} style={styles.icon} />}
      <Text style={[styles.text, { color: textColor }]}>{label}</Text>
      {online && !syncing && pending > 0 && (
        <TouchableOpacity onPress={sync}>
          <Text style={[styles.action, { color: textColor }]}>Sync now</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    gap: spacing.sm
  },
  icon: { marginRight: 2 },
  text: { flex: 1, fontSize: font.size.sm, fontWeight: font.weight.medium },
  action: { fontSize: font.size.sm, fontWeight: font.weight.bold, textDecorationLine: "underline" }
});
