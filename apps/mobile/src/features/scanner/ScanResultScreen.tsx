import { ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button } from "../../components/Button";
import { colors, font, radius, spacing } from "../../constants/theme";
import type { QrScanResult } from "../../api/endpoints";

type Props = {
  route: { params: { result: QrScanResult } };
  navigation: { goBack: () => void; navigate: (screen: string) => void };
};

function valueText(value: unknown) {
  if (value === null || value === undefined) return "-";
  if (typeof value === "string" && value.includes("T")) return value.slice(0, 10);
  return String(value);
}

export function ScanResultScreen({ route, navigation }: Props) {
  const { result } = route.params;
  return (
    <SafeAreaView style={styles.safe} edges={["bottom"]}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Text style={styles.kicker}>{result.entityType.replace(/_/g, " ")}</Text>
          <Text style={styles.title}>{result.label}</Text>
          <Text style={styles.subtle}>{result.barcodeValue}</Text>
        </View>

        <View style={styles.statusRow}>
          <View style={styles.statusPill}><Text style={styles.statusText}>{result.status}</Text></View>
          <Text style={styles.scanned}>Scanned {new Date(result.scannedAt).toLocaleString()}</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Authorized Details</Text>
          {Object.entries(result.details ?? {}).map(([key, value]) => (
            <View key={key} style={styles.detailRow}>
              <Text style={styles.detailKey}>{key.replace(/([A-Z])/g, " $1")}</Text>
              <Text style={styles.detailValue}>{valueText(value)}</Text>
            </View>
          ))}
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Traceability Code</Text>
          <Text style={styles.payload}>{result.payload}</Text>
        </View>

        <View style={styles.actions}>
          <Button label="Scan Another" onPress={() => navigation.goBack()} />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.lg, gap: spacing.md },
  header: { backgroundColor: colors.bgCard, borderRadius: radius.lg, padding: spacing.lg, borderWidth: 1, borderColor: colors.border },
  kicker: { color: colors.brand, fontSize: font.size.xs, fontWeight: font.weight.bold, textTransform: "uppercase", marginBottom: spacing.xs },
  title: { color: colors.ink, fontSize: font.size.xxl, fontWeight: font.weight.bold },
  subtle: { color: colors.inkMid, fontSize: font.size.sm, marginTop: spacing.xs },
  statusRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, flexWrap: "wrap" },
  statusPill: { backgroundColor: colors.brandLight, borderRadius: radius.full, paddingHorizontal: spacing.md, paddingVertical: spacing.xs },
  statusText: { color: colors.brand, fontSize: font.size.xs, fontWeight: font.weight.bold },
  scanned: { color: colors.inkMid, fontSize: font.size.sm },
  card: { backgroundColor: colors.bgCard, borderRadius: radius.lg, padding: spacing.lg, borderWidth: 1, borderColor: colors.border },
  cardTitle: { color: colors.ink, fontSize: font.size.md, fontWeight: font.weight.bold, marginBottom: spacing.md },
  detailRow: { borderTopWidth: 1, borderTopColor: colors.border, paddingVertical: spacing.sm },
  detailKey: { color: colors.inkMid, fontSize: font.size.xs, textTransform: "uppercase" },
  detailValue: { color: colors.ink, fontSize: font.size.md, fontWeight: font.weight.medium, marginTop: 2 },
  payload: { color: colors.inkMid, fontSize: font.size.sm, lineHeight: 20 },
  actions: { marginTop: spacing.sm }
});
