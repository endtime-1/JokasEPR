import { useState } from "react";
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { CameraView, useCameraPermissions } from "expo-camera";
import { useNavigation } from "@react-navigation/native";
import { scanQrCode } from "../../api/endpoints";
import { colors, font, radius, shadow, spacing } from "../../constants/theme";

const CORNER = 28;
const BORDER = 3;

export function ScannerScreen() {
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned]   = useState(false);
  const [resolving, setResolving] = useState(false);
  const [error, setError]       = useState("");
  const [lastCode, setLastCode] = useState("");
  const navigation = useNavigation<any>();

  // Permission loading
  if (!permission) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.brand} />
          <Text style={styles.centreMsg}>Requesting camera access…</Text>
        </View>
      </SafeAreaView>
    );
  }

  // Permission denied
  if (!permission.granted) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <View style={styles.permIconWrap}>
            <Text style={styles.permIcon}>📷</Text>
          </View>
          <Text style={styles.permTitle}>Camera Access Required</Text>
          <Text style={styles.permDesc}>
            Allow camera access to scan QR codes and barcodes on farm assets, stock, and batches.
          </Text>
          <TouchableOpacity style={styles.permBtn} onPress={requestPermission} activeOpacity={0.85}>
            <Text style={styles.permBtnText}>Grant Camera Access</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  async function onBarcodeScanned({ type, data }: { type: string; data: string }) {
    if (scanned) return;
    setScanned(true);
    setError("");
    setResolving(true);
    setLastCode(data);
    try {
      const result = await scanQrCode(data);
      navigation.navigate("ScanResult", { result: result.data });
    } catch (err) {
      setError(err instanceof Error ? err.message : `Cannot resolve ${type} code.`);
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
            {/* Top dim */}
            <View style={styles.overlayTop} />

            {/* Middle row */}
            <View style={styles.overlayRow}>
              <View style={styles.overlaySide} />

              {/* Viewfinder */}
              <View style={styles.viewfinder}>
                <View style={[styles.corner, styles.cornerTL]} />
                <View style={[styles.corner, styles.cornerTR]} />
                <View style={[styles.corner, styles.cornerBL]} />
                <View style={[styles.corner, styles.cornerBR]} />
                {resolving && (
                  <View style={styles.scanningLine}>
                    <ActivityIndicator color={colors.brand} />
                  </View>
                )}
              </View>

              <View style={styles.overlaySide} />
            </View>

            {/* Bottom dim */}
            <View style={styles.overlayBottom}>
              <Text style={styles.scanHint}>
                {resolving
                  ? "Resolving ERP record…"
                  : scanned && !error
                    ? `Scanned: ${lastCode.slice(0, 30)}${lastCode.length > 30 ? "…" : ""}`
                    : "Align QR code or barcode within the frame"}
              </Text>
            </View>
          </View>
        </CameraView>

        {/* Footer panel */}
        <View style={styles.footer}>
          <View style={styles.footerTop}>
            <View style={styles.footerIconWrap}>
              <Text style={styles.footerIconEmoji}>📷</Text>
            </View>
            <View>
              <Text style={styles.footerTitle}>QR / Barcode Scanner</Text>
              <Text style={styles.footerSub}>Supports QR, EAN-13, Code 128, and more</Text>
            </View>
          </View>

          {error !== "" && (
            <View style={styles.errorBanner}>
              <Text style={styles.errorIcon}>⚠️</Text>
              <Text style={styles.errorText} numberOfLines={2}>{error}</Text>
            </View>
          )}

          {(scanned || error !== "") && (
            <TouchableOpacity
              style={styles.rescanBtn}
              onPress={() => { setScanned(false); setError(""); }}
              disabled={resolving}
              activeOpacity={0.85}
            >
              <Text style={styles.rescanBtnText}>Scan Again</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#000" },
  container: { flex: 1 },
  camera: { flex: 1 },

  // permission screen
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.xxxl,
    gap: spacing.lg,
    backgroundColor: colors.bg,
  },
  centreMsg: { fontSize: font.size.sm, color: colors.inkLight },
  permIconWrap: {
    width: 100, height: 100, borderRadius: 50,
    backgroundColor: colors.brandLight, borderWidth: 1, borderColor: colors.brandMid,
    alignItems: "center", justifyContent: "center",
    ...shadow.md,
  },
  permIcon: { fontSize: 48 },
  permTitle: { fontSize: font.size.xl, fontWeight: font.weight.extrabold, color: colors.ink, textAlign: "center" },
  permDesc: { fontSize: font.size.md, color: colors.inkMid, textAlign: "center", lineHeight: 22 },
  permBtn: {
    backgroundColor: colors.brand,
    borderRadius: radius.full,
    paddingHorizontal: spacing.xxxl,
    paddingVertical: spacing.md,
    ...shadow.brand,
  },
  permBtnText: { color: colors.white, fontSize: font.size.md, fontWeight: font.weight.bold },

  // overlay
  overlay: { flex: 1 },
  overlayTop: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)" },
  overlayRow: { flexDirection: "row" },
  overlaySide: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)" },

  viewfinder: { width: 250, height: 250, position: "relative" },
  corner: {
    position: "absolute",
    width: CORNER,
    height: CORNER,
    borderColor: colors.white,
  },
  cornerTL: { top: 0, left: 0, borderTopWidth: BORDER, borderLeftWidth: BORDER },
  cornerTR: { top: 0, right: 0, borderTopWidth: BORDER, borderRightWidth: BORDER },
  cornerBL: { bottom: 0, left: 0, borderBottomWidth: BORDER, borderLeftWidth: BORDER },
  cornerBR: { bottom: 0, right: 0, borderBottomWidth: BORDER, borderRightWidth: BORDER },

  scanningLine: {
    position: "absolute",
    top: "50%",
    left: 0,
    right: 0,
    alignItems: "center",
  },

  overlayBottom: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    alignItems: "center",
    paddingTop: spacing.xl,
  },
  scanHint: {
    color: "rgba(255,255,255,0.85)",
    fontSize: font.size.sm,
    textAlign: "center",
    paddingHorizontal: spacing.xl,
  },

  // footer
  footer: {
    backgroundColor: colors.bgCard,
    padding: spacing.xl,
    gap: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  footerTop: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  footerIconWrap: {
    width: 48, height: 48, borderRadius: radius.md,
    backgroundColor: "#c084fc22",
    alignItems: "center", justifyContent: "center",
  },
  footerIconEmoji: { fontSize: 24 },
  footerTitle: { fontSize: font.size.md, fontWeight: font.weight.bold, color: colors.ink },
  footerSub: { fontSize: font.size.xs, color: colors.inkLight },

  errorBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.errorBg,
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: "#fca5a5",
  },
  errorIcon: { fontSize: 16 },
  errorText: { flex: 1, fontSize: font.size.sm, color: colors.error, fontWeight: font.weight.medium },

  rescanBtn: {
    backgroundColor: colors.brand,
    borderRadius: radius.full,
    paddingVertical: spacing.md,
    alignItems: "center",
    ...shadow.brand,
  },
  rescanBtnText: { color: colors.white, fontSize: font.size.md, fontWeight: font.weight.bold },
});
