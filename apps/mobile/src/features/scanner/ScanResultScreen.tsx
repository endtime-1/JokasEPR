import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors, font, radius, shadow, spacing } from "../../constants/theme";
import type { QrScanResult } from "../../api/endpoints";

type Props = {
  route: { params: { result: QrScanResult } };
  navigation: { goBack: () => void };
};

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "string" && /\d{4}-\d{2}-\d{2}T/.test(value)) return value.slice(0, 10);
  return String(value);
}

function humanKey(key: string) {
  return key
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (c) => c.toUpperCase());
}

export function ScanResultScreen({ route, navigation }: Props) {
  const { result } = route.params;

  return (
    <SafeAreaView style={styles.safe} edges={["bottom"]}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>

        {/* Header hero */}
        <View style={styles.hero}>
          <View style={styles.heroIconWrap}>
            <Text style={styles.heroIcon}>✅</Text>
          </View>
          <View style={styles.heroBadge}>
            <Text style={styles.heroBadgeText}>{result.entityType.replace(/_/g, " ")}</Text>
          </View>
          <Text style={styles.heroLabel}>{result.label}</Text>
          <Text style={styles.heroBarcode}>{result.barcodeValue}</Text>

          <View style={styles.heroMeta}>
            <View style={styles.statusPill}>
              <Text style={styles.statusPillText}>{result.status}</Text>
            </View>
            <Text style={styles.scannedTime}>
              Scanned {new Date(result.scannedAt).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
            </Text>
          </View>
        </View>

        {/* Authorized details */}
        {result.details && Object.keys(result.details).length > 0 && (
          <View style={styles.card}>
            <View style={styles.cardTitleRow}>
              <Text style={styles.cardTitleIcon}>🔐</Text>
              <Text style={styles.cardTitle}>Authorized Details</Text>
            </View>
            {Object.entries(result.details).map(([key, value], idx, arr) => (
              <View key={key} style={[styles.detailRow, idx === arr.length - 1 && styles.detailRowLast]}>
                <Text style={styles.detailKey}>{humanKey(key)}</Text>
                <Text style={styles.detailValue}>{formatValue(value)}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Traceability payload */}
        <View style={styles.card}>
          <View style={styles.cardTitleRow}>
            <Text style={styles.cardTitleIcon}>🔗</Text>
            <Text style={styles.cardTitle}>Traceability Code</Text>
          </View>
          <View style={styles.payloadBox}>
            <Text style={styles.payloadText}>{result.payload}</Text>
          </View>
        </View>

        {/* Action */}
        <TouchableOpacity style={styles.scanAgainBtn} onPress={() => navigation.goBack()} activeOpacity={0.85}>
          <Text style={styles.scanAgainText}>← Scan Another</Text>
        </TouchableOpacity>

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.xl, gap: spacing.lg, paddingBottom: spacing.xxxl },

  hero: {
    backgroundColor: colors.bgCard,
    borderRadius: radius.xxl,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.xl,
    alignItems: "center",
    gap: spacing.sm,
    ...shadow.md,
  },
  heroIconWrap: {
    width: 68, height: 68, borderRadius: 34,
    backgroundColor: "#f0fdf4", borderWidth: 1, borderColor: "#86efac",
    alignItems: "center", justifyContent: "center",
    marginBottom: spacing.xs,
  },
  heroIcon: { fontSize: 34 },
  heroBadge: {
    backgroundColor: colors.brandLight,
    paddingHorizontal: spacing.md,
    paddingVertical: 4,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.brandMid,
  },
  heroBadgeText: { fontSize: font.size.xs, fontWeight: font.weight.bold, color: colors.brand, textTransform: "uppercase", letterSpacing: 0.8 },
  heroLabel: { fontSize: font.size.xxl, fontWeight: font.weight.extrabold, color: colors.ink, textAlign: "center" },
  heroBarcode: { fontSize: font.size.sm, color: colors.inkLight, fontFamily: "monospace" },
  heroMeta: { flexDirection: "row", alignItems: "center", gap: spacing.md, marginTop: spacing.xs, flexWrap: "wrap", justifyContent: "center" },
  statusPill: {
    backgroundColor: "#f0fdf4",
    paddingHorizontal: spacing.md,
    paddingVertical: 4,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: "#86efac",
  },
  statusPillText: { fontSize: font.size.xs, fontWeight: font.weight.bold, color: "#16a34a" },
  scannedTime: { fontSize: font.size.xs, color: colors.inkMid },

  card: {
    backgroundColor: colors.bgCard,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: "hidden",
    ...shadow.sm,
  },
  cardTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.bg,
  },
  cardTitleIcon: { fontSize: 16 },
  cardTitle: { fontSize: font.size.md, fontWeight: font.weight.bold, color: colors.ink },

  detailRow: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap: 4,
  },
  detailRowLast: { borderBottomWidth: 0 },
  detailKey: { fontSize: font.size.xs, fontWeight: font.weight.semibold, color: colors.inkLight, textTransform: "uppercase", letterSpacing: 0.5 },
  detailValue: { fontSize: font.size.md, fontWeight: font.weight.medium, color: colors.ink },

  payloadBox: {
    margin: spacing.lg,
    backgroundColor: colors.bg,
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  payloadText: { fontSize: font.size.sm, color: colors.inkMid, lineHeight: 20, fontFamily: "monospace" },

  scanAgainBtn: {
    backgroundColor: colors.brand,
    borderRadius: radius.full,
    paddingVertical: spacing.md,
    alignItems: "center",
    ...shadow.brand,
  },
  scanAgainText: { color: colors.white, fontSize: font.size.md, fontWeight: font.weight.bold },
});
