import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useAuth } from "../auth/AuthContext";
import { colors, font, radius, shadow, spacing } from "../constants/theme";

const SAVED_EMAIL_KEY = "jokas.lastEmail";

export function LoginScreen() {
  const { login } = useAuth();
  const passwordRef = useRef<TextInput>(null);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [apiError, setApiError] = useState("");
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});

  // restore saved email on mount
  useEffect(() => {
    AsyncStorage.getItem(SAVED_EMAIL_KEY)
      .then((saved) => { if (saved) setEmail(saved); })
      .catch(() => {});
  }, []);

  function validate() {
    const e: typeof errors = {};
    if (!email.trim()) e.email = "Email is required";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) e.email = "Invalid email address";
    if (!password) e.password = "Password is required";
    else if (password.length < 6) e.password = "Password too short";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function handleLogin() {
    setApiError("");
    if (!validate()) return;
    setLoading(true);
    try {
      await AsyncStorage.setItem(SAVED_EMAIL_KEY, email.trim().toLowerCase());
      await login(email.trim().toLowerCase(), password);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Sign-in failed. Check your credentials.";
      setApiError(msg);
      Alert.alert("Sign-in failed", msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <KeyboardAvoidingView
        style={styles.fill}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={0}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          bounces={false}
        >
          {/* ── Hero ── */}
          <View style={styles.hero}>
            {/* decorative circles */}
            <View style={[styles.deco, styles.decoTL]} />
            <View style={[styles.deco, styles.decoBR]} />
            <View style={[styles.deco, styles.decoMid]} />

            {/* logo */}
            <View style={styles.logoOuter}>
              <View style={styles.logoMid}>
                <View style={styles.logoInner}>
                  <Text style={styles.logoEmoji}>🌾</Text>
                </View>
              </View>
            </View>

            <Text style={styles.brand}>AKOKO SOLUTIONS</Text>
            <Text style={styles.tagline}>Enterprise Farm Management</Text>

            {/* small feature pills */}
            <View style={styles.pillRow}>
              {["🐔 Poultry", "📦 Inventory", "📊 Analytics"].map((p) => (
                <View key={p} style={styles.pill}>
                  <Text style={styles.pillText}>{p}</Text>
                </View>
              ))}
            </View>
          </View>

          {/* ── Form card ── */}
          <View style={styles.card}>

            {/* header */}
            <View style={styles.cardHeader}>
              <Text style={styles.cardTitle}>Welcome back</Text>
              <Text style={styles.cardSub}>Sign in to your Jokas ERP account</Text>
            </View>

            {/* API error banner */}
            {apiError !== "" && (
              <View style={styles.errorBanner}>
                <Text style={styles.errorBannerIcon}>⚠️</Text>
                <Text style={styles.errorBannerText}>{apiError}</Text>
                <TouchableOpacity onPress={() => setApiError("")}>
                  <Text style={styles.errorBannerClose}>✕</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* email field */}
            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>Email address <Text style={styles.required}>*</Text></Text>
              <View style={[styles.inputRow, errors.email ? styles.inputError : email ? styles.inputFilled : null]}>
                <Text style={styles.inputIcon}>✉️</Text>
                <TextInput
                  style={styles.input}
                  value={email}
                  onChangeText={(t) => { setEmail(t); setErrors((e) => ({ ...e, email: undefined })); setApiError(""); }}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  returnKeyType="next"
                  placeholder="you@company.com"
                  placeholderTextColor={colors.inkLight}
                  onSubmitEditing={() => passwordRef.current?.focus()}
                  blurOnSubmit={false}
                />
                {email.length > 0 && !errors.email && (
                  <TouchableOpacity onPress={() => { setEmail(""); setErrors((e) => ({ ...e, email: undefined })); }}>
                    <Text style={styles.clearBtn}>✕</Text>
                  </TouchableOpacity>
                )}
              </View>
              {errors.email && <Text style={styles.fieldError}>⚠ {errors.email}</Text>}
            </View>

            {/* password field */}
            <View style={styles.fieldGroup}>
              <View style={styles.labelRow}>
                <Text style={styles.fieldLabel}>Password <Text style={styles.required}>*</Text></Text>
              </View>
              <View style={[styles.inputRow, errors.password ? styles.inputError : password ? styles.inputFilled : null]}>
                <Text style={styles.inputIcon}>🔒</Text>
                <TextInput
                  ref={passwordRef}
                  style={styles.input}
                  value={password}
                  onChangeText={(t) => { setPassword(t); setErrors((e) => ({ ...e, password: undefined })); setApiError(""); }}
                  secureTextEntry={!showPassword}
                  returnKeyType="done"
                  placeholder="••••••••"
                  placeholderTextColor={colors.inkLight}
                  onSubmitEditing={handleLogin}
                />
                <TouchableOpacity onPress={() => setShowPassword(!showPassword)} style={styles.eyeBtn}>
                  <Text style={styles.eyeText}>{showPassword ? "Hide" : "Show"}</Text>
                </TouchableOpacity>
              </View>
              {errors.password && <Text style={styles.fieldError}>⚠ {errors.password}</Text>}
            </View>

            {/* sign in button */}
            <TouchableOpacity
              style={[styles.signInBtn, loading && styles.signInBtnLoading]}
              onPress={handleLogin}
              disabled={loading}
              activeOpacity={0.85}
            >
              {loading ? (
                <View style={styles.signInBtnContent}>
                  <ActivityIndicator size="small" color={colors.white} />
                  <Text style={styles.signInBtnText}>Signing in…</Text>
                </View>
              ) : (
                <View style={styles.signInBtnContent}>
                  <Text style={styles.signInBtnText}>Sign in</Text>
                  <Text style={styles.signInBtnArrow}>→</Text>
                </View>
              )}
            </TouchableOpacity>

            {/* support note */}
            <Text style={styles.supportNote}>
              Having trouble? Contact your system administrator.
            </Text>

            {/* divider */}
            <View style={styles.divider}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>AKOKO SOLUTIONS ERP</Text>
              <View style={styles.dividerLine} />
            </View>

            {/* feature list */}
            <View style={styles.featureList}>
              {[
                { icon: "🔐", text: "Secure JWT authentication" },
                { icon: "🔄", text: "Offline-first with auto sync" },
                { icon: "🏡", text: "Multi-farm field operations" },
              ].map((f) => (
                <View key={f.text} style={styles.featureItem}>
                  <Text style={styles.featureIcon}>{f.icon}</Text>
                  <Text style={styles.featureText}>{f.text}</Text>
                </View>
              ))}
            </View>

          </View>

          {/* footer */}
          <View style={styles.footer}>
            <Text style={styles.footerText}>© 2026 Jokas Farms · AKOKO SOLUTIONS</Text>
            <Text style={styles.footerVersion}>v1.0.0</Text>
          </View>

        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.brand },
  fill: { flex: 1 },
  scroll: { flexGrow: 1 },

  // ── Hero ──────────────────────────────
  hero: {
    backgroundColor: colors.brand,
    alignItems: "center",
    paddingTop: spacing.xxxl,
    paddingBottom: 60,
    paddingHorizontal: spacing.xl,
    gap: spacing.sm,
    overflow: "hidden",
  },
  deco: {
    position: "absolute",
    borderRadius: radius.full,
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  decoTL: { width: 200, height: 200, top: -60, left: -60 },
  decoBR: { width: 160, height: 160, bottom: -30, right: -40 },
  decoMid: { width: 100, height: 100, top: 30, right: 30 },

  logoOuter: {
    width: 110,
    height: 110,
    borderRadius: 55,
    backgroundColor: "rgba(255,255,255,0.15)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.sm,
  },
  logoMid: {
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: "rgba(255,255,255,0.2)",
    alignItems: "center",
    justifyContent: "center",
  },
  logoInner: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.white,
    alignItems: "center",
    justifyContent: "center",
    ...shadow.lg,
  },
  logoEmoji: { fontSize: 36 },

  brand: {
    fontSize: font.size.xl,
    fontWeight: font.weight.extrabold,
    color: colors.white,
    letterSpacing: 2,
  },
  tagline: {
    fontSize: font.size.sm,
    color: "rgba(255,255,255,0.8)",
    letterSpacing: 0.4,
  },

  pillRow: {
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: spacing.sm,
    flexWrap: "wrap",
    justifyContent: "center",
  },
  pill: {
    backgroundColor: "rgba(255,255,255,0.18)",
    borderRadius: radius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.25)",
  },
  pillText: {
    color: colors.white,
    fontSize: font.size.xs,
    fontWeight: font.weight.semibold,
  },

  // ── Card ──────────────────────────────
  card: {
    backgroundColor: colors.bgCard,
    borderTopLeftRadius: radius.xxl,
    borderTopRightRadius: radius.xxl,
    marginTop: -28,
    padding: spacing.xxl,
    paddingTop: spacing.xxxl,
    gap: spacing.lg,
    flex: 1,
    minHeight: 520,
  },

  cardHeader: { gap: 4, marginBottom: spacing.xs },
  cardTitle: {
    fontSize: font.size.xxl,
    fontWeight: font.weight.extrabold,
    color: colors.ink,
  },
  cardSub: { fontSize: font.size.sm, color: colors.inkLight },

  // error banner
  errorBanner: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.errorBg,
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: "#fca5a5",
    gap: spacing.sm,
  },
  errorBannerIcon: { fontSize: 16 },
  errorBannerText: {
    flex: 1,
    fontSize: font.size.sm,
    color: colors.error,
    fontWeight: font.weight.medium,
  },
  errorBannerClose: { color: colors.error, fontSize: 14, fontWeight: font.weight.bold, padding: 2 },

  // fields
  fieldGroup: { gap: 7 },
  labelRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  fieldLabel: {
    fontSize: font.size.sm,
    fontWeight: font.weight.semibold,
    color: colors.inkMid,
  },
  required: { color: colors.brand },

  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 52,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.bgCard,
    gap: spacing.sm,
  },
  inputFilled: { borderColor: colors.brand, backgroundColor: "#fffdf9" },
  inputError: { borderColor: colors.error, backgroundColor: colors.errorBg },
  inputIcon: { fontSize: 16 },
  input: {
    flex: 1,
    fontSize: font.size.md,
    color: colors.ink,
    paddingVertical: spacing.sm,
  },
  clearBtn: { color: colors.inkLight, fontSize: 14, padding: 4 },
  eyeBtn: { paddingHorizontal: 4, paddingVertical: 4 },
  eyeText: {
    fontSize: font.size.sm,
    color: colors.brand,
    fontWeight: font.weight.semibold,
  },
  fieldError: {
    fontSize: font.size.xs,
    color: colors.error,
    fontWeight: font.weight.medium,
  },

  // sign-in button
  signInBtn: {
    backgroundColor: colors.brand,
    borderRadius: radius.full,
    minHeight: 56,
    alignItems: "center",
    justifyContent: "center",
    marginTop: spacing.xs,
    ...shadow.brand,
  },
  signInBtnLoading: { opacity: 0.8 },
  signInBtnContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  signInBtnText: {
    color: colors.white,
    fontSize: font.size.md,
    fontWeight: font.weight.bold,
    letterSpacing: 0.3,
  },
  signInBtnArrow: { color: colors.white, fontSize: font.size.lg },

  supportNote: {
    textAlign: "center",
    fontSize: font.size.xs,
    color: colors.inkLight,
    marginTop: -spacing.xs,
  },

  // divider
  divider: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  dividerLine: { flex: 1, height: 1, backgroundColor: colors.border },
  dividerText: {
    fontSize: font.size.xs,
    color: colors.inkLight,
    fontWeight: font.weight.semibold,
    letterSpacing: 0.8,
  },

  // features
  featureList: { gap: spacing.sm },
  featureItem: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  featureIcon: { fontSize: 18, width: 28 },
  featureText: { fontSize: font.size.sm, color: colors.inkMid, fontWeight: font.weight.medium },

  // footer
  footer: {
    backgroundColor: colors.bgCard,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: spacing.xxl,
    paddingVertical: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  footerText: { fontSize: font.size.xs, color: colors.inkLight },
  footerVersion: {
    fontSize: font.size.xs,
    color: colors.brand,
    fontWeight: font.weight.semibold,
  },
});
