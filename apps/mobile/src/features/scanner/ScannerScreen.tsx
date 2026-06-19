import { useState } from "react";
import { ActivityIndicator, Alert, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { CameraView, useCameraPermissions } from "expo-camera";
import { useNavigation } from "@react-navigation/native";
import { scanQrCode } from "../../api/endpoints";
import { colors, font, radius, spacing } from "../../constants/theme";

export function ScannerScreen() {
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [lastCode, setLastCode] = useState("");
  const navigation = useNavigation<any>();

  if (!permission) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}><Text style={styles.msg}>Requesting camera permission…</Text></View>
      </SafeAreaView>
    );
  }

  if (!permission.granted) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <Text style={styles.icon}>📷</Text>
          <Text style={styles.title}>Camera Permission Required</Text>
          <Text style={styles.msg}>Allow camera access to scan QR codes and barcodes.</Text>
          <TouchableOpacity style={styles.btn} onPress={requestPermission}>
            <Text style={styles.btnText}>Grant Permission</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  async function onBarcodeScanned({ type, data }: { type: string; data: string }) {
    if (scanned) return;
    setScanned(true);
    setResolving(true);
    setLastCode(data);
    try {
      const result = await scanQrCode(data);
      navigation.navigate("ScanResult", { result: result.data });
    } catch (error) {
      Alert.alert(
        "Scan Not Authorized",
        error instanceof Error ? error.message : `Unable to resolve ${type} code.`,
        [{ text: "Scan Again", onPress: () => setScanned(false) }]
      );
    } finally {
      setResolving(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe} edges={["bottom"]}>
      <View style={styles.container}>
        <CameraView
          style={styles.camera}
          facing="back"
          onBarcodeScanned={scanned ? undefined : onBarcodeScanned}
          barcodeScannerSettings={{ barcodeTypes: ["qr", "ean13", "ean8", "code128", "code39", "datamatrix"] }}
        >
          <View style={styles.overlay}>
            <View style={styles.viewfinder}>
              <View style={[styles.corner, styles.topLeft]} />
              <View style={[styles.corner, styles.topRight]} />
              <View style={[styles.corner, styles.bottomLeft]} />
              <View style={[styles.corner, styles.bottomRight]} />
            </View>
          </View>
        </CameraView>

        <View style={styles.footer}>
          <Text style={styles.footerTitle}>QR / Barcode Scanner</Text>
          <Text style={styles.footerDesc}>
            {resolving ? "Resolving secure ERP record..." : scanned ? `Scanned: ${lastCode}` : "Point camera at a QR code or barcode"}
          </Text>
          {resolving && <ActivityIndicator color={colors.brand} />}
          {scanned && (
            <TouchableOpacity style={styles.rescanBtn} onPress={() => setScanned(false)} disabled={resolving}>
              <Text style={styles.rescanText}>Scan Again</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </SafeAreaView>
  );
}

const CORNER_SIZE = 24;
const CORNER_WIDTH = 3;

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#000" },
  container: { flex: 1 },
  camera: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.xl, gap: spacing.lg, backgroundColor: colors.bg },
  icon: { fontSize: 56 },
  title: { fontSize: font.size.xl, fontWeight: font.weight.bold, color: colors.ink, textAlign: "center" },
  msg: { fontSize: font.size.md, color: colors.inkMid, textAlign: "center", lineHeight: 22 },
  btn: { backgroundColor: colors.brand, paddingHorizontal: spacing.xl, paddingVertical: spacing.md, borderRadius: radius.md },
  btnText: { color: "#fff", fontWeight: font.weight.bold, fontSize: font.size.md },
  overlay: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(0,0,0,0.5)" },
  viewfinder: { width: 240, height: 240, position: "relative" },
  corner: { position: "absolute", width: CORNER_SIZE, height: CORNER_SIZE, borderColor: "#fff" },
  topLeft: { top: 0, left: 0, borderTopWidth: CORNER_WIDTH, borderLeftWidth: CORNER_WIDTH },
  topRight: { top: 0, right: 0, borderTopWidth: CORNER_WIDTH, borderRightWidth: CORNER_WIDTH },
  bottomLeft: { bottom: 0, left: 0, borderBottomWidth: CORNER_WIDTH, borderLeftWidth: CORNER_WIDTH },
  bottomRight: { bottom: 0, right: 0, borderBottomWidth: CORNER_WIDTH, borderRightWidth: CORNER_WIDTH },
  footer: {
    backgroundColor: colors.bgCard,
    padding: spacing.xl,
    gap: spacing.sm,
    alignItems: "center"
  },
  footerTitle: { fontSize: font.size.lg, fontWeight: font.weight.bold, color: colors.ink },
  footerDesc: { fontSize: font.size.sm, color: colors.inkMid, textAlign: "center" },
  rescanBtn: { backgroundColor: colors.brand, paddingHorizontal: spacing.xl, paddingVertical: spacing.sm, borderRadius: radius.md, marginTop: spacing.sm },
  rescanText: { color: "#fff", fontWeight: font.weight.bold }
});
