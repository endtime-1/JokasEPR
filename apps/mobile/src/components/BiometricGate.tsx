import { useEffect, useRef, useState } from "react";
import { AppState, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import * as LocalAuthentication from "expo-local-authentication";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { colors, font, radius, spacing } from "../constants/theme";

const LOCK_AFTER_BACKGROUND_MS = 5 * 60 * 1000;

export function BiometricGate({ children }: { children: React.ReactNode }) {
  const [locked, setLocked] = useState(false);
  const [hasBiometrics, setHasBiometrics] = useState(false);
  const backgroundAt = useRef<number | null>(null);

  useEffect(() => {
    (async () => {
      const hasHw = await LocalAuthentication.hasHardwareAsync();
      const enrolled = hasHw && (await LocalAuthentication.isEnrolledAsync());
      setHasBiometrics(enrolled);
    })();
  }, []);

  useEffect(() => {
    if (!hasBiometrics) return;
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "background" || state === "inactive") {
        backgroundAt.current = Date.now();
      } else if (state === "active" && backgroundAt.current !== null) {
        const elapsed = Date.now() - backgroundAt.current;
        backgroundAt.current = null;
        if (elapsed >= LOCK_AFTER_BACKGROUND_MS) { setLocked(true); authenticate(); }
      }
    });
    return () => sub.remove();
  }, [hasBiometrics]);

  async function authenticate() {
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: "Verify your identity to continue",
      cancelLabel: "Cancel",
      fallbackLabel: "Use PIN",
    });
    if (result.success) setLocked(false);
  }

  if (locked) {
    return (
      <View style={styles.gate}>
        <MaterialCommunityIcons name="lock-outline" size={64} color={colors.inkLight} />
        <Text style={styles.title}>App Locked</Text>
        <Text style={styles.sub}>
          The app was locked after being in the background.{"\n"}Verify your identity to continue.
        </Text>
        <TouchableOpacity style={styles.btn} onPress={authenticate} activeOpacity={0.8}>
          <MaterialCommunityIcons name="fingerprint" size={20} color="#fff" />
          <Text style={styles.btnText}>Unlock</Text>
        </TouchableOpacity>
      </View>
    );
  }
  return <>{children}</>;
}

const styles = StyleSheet.create({
  gate:    { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.bg, padding: 40, gap: spacing.lg },
  title:   { fontSize: font.size.xl, fontFamily: font.family.bold, color: colors.ink, marginTop: spacing.md },
  sub:     { fontSize: font.size.sm, fontFamily: font.family.regular, color: colors.inkLight, textAlign: "center", lineHeight: 22 },
  btn:     { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginTop: spacing.lg, backgroundColor: colors.brand, paddingHorizontal: 36, paddingVertical: spacing.lg, borderRadius: radius.xl },
  btnText: { fontSize: font.size.md, fontFamily: font.family.bold, color: "#fff" },
});
