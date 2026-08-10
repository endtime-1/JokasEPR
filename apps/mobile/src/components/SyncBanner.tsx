import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { colors, font, spacing } from "../constants/theme";
import { useSync } from "../hooks/useSync";

export function SyncBanner() {
  const navigation = useNavigation<any>();
  const { pending, failed, syncing, lastSyncAt, sync, online } = useSync();

  // M5: previously `pending === 0 && online` hid the banner entirely — a
  // record that hit the 5-attempt retry ceiling drops out of `pending`, so
  // the app looked fully synced while it sat permanently stuck. `failed`
  // keeps the banner (and a distinct message) visible until someone
  // actually resolves it from Sync Status.
  if (pending === 0 && failed === 0 && online) return null;

  const hasFailures = failed > 0;
  const bg = hasFailures ? colors.errorBg : !online ? colors.warningBg : syncing ? colors.infoBg : colors.brandLight;
  const textColor = hasFailures ? colors.error : !online ? colors.warning : syncing ? colors.info : colors.brand;

  const pendingPart = !online
    ? `Offline · ${pending} record${pending !== 1 ? "s" : ""} pending`
    : syncing
    ? "Syncing…"
    : `${pending} record${pending !== 1 ? "s" : ""} pending sync`;
  const label = hasFailures
    ? `${pendingPart}${pending > 0 ? " · " : ""}${failed} failed — needs attention`
    : pendingPart;

  const content = (
    <>
      {syncing && <ActivityIndicator size="small" color={textColor} style={styles.icon} />}
      <Text style={[styles.text, { color: textColor }]}>{label}</Text>
      {/* M5 follow-up: a failed-only banner (pending === 0) previously had no
          tap target at all — it told the user something "needs attention"
          with no way to act on it. Failed records don't retry themselves, so
          this always routes to Sync Status regardless of online state (that
          screen reads the local queue and works offline). The plain "Sync
          now" action is kept for the ordinary pending-only case. */}
      {!hasFailures && online && !syncing && pending > 0 && (
        <TouchableOpacity onPress={sync}>
          <Text style={[styles.action, { color: textColor }]}>Sync now</Text>
        </TouchableOpacity>
      )}
      {hasFailures && (
        <Text style={[styles.action, { color: textColor }]}>Review</Text>
      )}
    </>
  );

  if (hasFailures) {
    return (
      <TouchableOpacity
        style={[styles.banner, { backgroundColor: bg }]}
        onPress={() => navigation.navigate("SyncStatus")}
        accessibilityRole="button"
        accessibilityLabel={`${label}. Tap to review.`}
      >
        {content}
      </TouchableOpacity>
    );
  }

  return <View style={[styles.banner, { backgroundColor: bg }]}>{content}</View>;
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
