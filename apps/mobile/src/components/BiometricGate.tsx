import { useEffect, useRef, useState } from "react";
import { Alert, AppState, StyleSheet, Text, TouchableOpacity, View } from "react-native";
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
      // (L6) isEnrolledAsync() only reports biometric (fingerprint/face)
      // enrollment — a user with a device PIN/pattern/password set but no
      // fingerprint registered got hasBiometrics=false, which disabled the
      // app-lock feature entirely rather than falling back to that PIN.
      // getEnrolledLevelAsync() reports SECRET (PIN/pattern/password) or
      // BIOMETRIC, so the lock now arms whenever the device has ANY form of
      // authentication set up, not biometrics specifically.
      const level = await LocalAuthentication.getEnrolledLevelAsync();
      const enrolled = level !== LocalAuthentication.SecurityLevel.NONE;
      setHasBiometrics(enrolled);
      // H-MOB-7: the app-lock feature only arms when the OS itself has a
      // lock configured — on a device with no PIN/pattern/biometric set up
      // (common on an inexpensive shared field device), it silently never
      // re-locks with nothing telling the user why. Can't build a real
      // in-app lock without a much larger scope increase (its own PIN
      // storage/verification), so this at least surfaces the gap instead of
      // leaving it invisible. Once per cold start, not on every foreground.
      if (!enrolled) {
        Alert.alert(
          "No Device Lock Set",
          "This device has no screen lock (PIN, pattern, fingerprint, or face) configured. Jokas ERP can't automatically re-lock itself when backgrounded without one — anyone who picks up this device stays signed in. Set a screen lock in your device Settings to protect your session.",
          [{ text: "OK" }]
        );
      }
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
