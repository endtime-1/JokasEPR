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
import { MaterialCommunityIcons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useAuth } from "../auth/AuthContext";
import { colors, font, radius, shadow, spacing } from "../constants/theme";

type MCName = React.ComponentProps<typeof MaterialCommunityIcons>["name"];

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
          {/* ── Hero Header ── */}
          <View style={styles.hero}>
            {/* Elegant glassmorphic background meshes */}
            <View style={[styles.deco, styles.decoTop]} />
            <View style={[styles.deco, styles.decoBottom]} />

            {/* Premium outer ring */}
            <View style={styles.logoOuter}>
              <View style={styles.logoMid}>
                <View style={styles.logoInner}>
                  <MaterialCommunityIcons name="leaf" size={42} color={colors.brand} />
                </View>
              </View>
            </View>

            <Text style={styles.brand}>JOKAS ERP</Text>
            <Text style={styles.tagline}>ENTERPRISE FARM OPERATIONS</Text>

            {/* Feature Tags */}
            <View style={styles.tagRow}>
              {[
                { label: "Poultry", icon: "bird" },
                { label: "Inventory", icon: "package-variant-closed" },
                { label: "Analytics", icon: "chart-box-outline" }
              ].map((p) => (
                <View key={p.label} style={styles.tagPill}>
                  <MaterialCommunityIcons name={p.icon as MCName} size={12} color="rgba(255,255,255,0.9)" />
                  <Text style={styles.tagText}>{p.label}</Text>
                </View>
              ))}
            </View>
          </View>

          {/* ── Form Card ── */}
          <View style={styles.card}>
            {/* Header */}
            <View style={styles.cardHeader}>
              <Text style={styles.cardTitle}>Welcome Back</Text>
              <Text style={styles.cardSub}>Sign in to access your Jokas dashboard</Text>
            </View>

            {/* API error banner */}
            {apiError !== "" && (
              <View style={styles.errorBanner}>
                <MaterialCommunityIcons name="alert-circle-outline" size={20} color={colors.error} />
                <Text style={styles.errorBannerText}>{apiError}</Text>
                <TouchableOpacity onPress={() => setApiError("")}>
                  <MaterialCommunityIcons name="close" size={16} color={colors.error} />
                </TouchableOpacity>
              </View>
            )}

            {/* Email Field */}
            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>
                Email address <Text style={styles.required}>*</Text>
              </Text>
              <View style={[styles.inputRow, errors.email ? styles.inputError : email ? styles.inputFilled : null]}>
                <MaterialCommunityIcons name="email-outline" size={18} color={email ? colors.brand : colors.inkLight} />
                <TextInput
                  style={styles.input}
                  value={email}
                  onChangeText={(t) => { setEmail(t); setErrors((e) => ({ ...e, email: undefined })); setApiError(""); }}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  returnKeyType="next"
                  placeholder="name@company.com"
                  placeholderTextColor={colors.inkLight}
                  onSubmitEditing={() => passwordRef.current?.focus()}
                  blurOnSubmit={false}
                />
                {email.length > 0 && !errors.email && (
                  <TouchableOpacity onPress={() => { setEmail(""); setErrors((e) => ({ ...e, email: undefined })); }}>
                    <MaterialCommunityIcons name="close-circle" size={16} color={colors.inkLight} />
                  </TouchableOpacity>
                )}
              </View>
              {errors.email && <Text style={styles.fieldError}>{errors.email}</Text>}
            </View>

            {/* Password Field */}
            <View style={styles.fieldGroup}>
              <View style={styles.labelRow}>
                <Text style={styles.fieldLabel}>
                  Password <Text style={styles.required}>*</Text>
                </Text>
              </View>
              <View style={[styles.inputRow, errors.password ? styles.inputError : password ? styles.inputFilled : null]}>
                <MaterialCommunityIcons name="lock-outline" size={18} color={password ? colors.brand : colors.inkLight} />
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
                  <MaterialCommunityIcons name={showPassword ? "eye-off-outline" : "eye-outline"} size={20} color={colors.brand} />
                </TouchableOpacity>
              </View>
              {errors.password && <Text style={styles.fieldError}>{errors.password}</Text>}
            </View>

            {/* Sign In Button */}
            <TouchableOpacity
              style={[styles.signInBtn, loading && styles.signInBtnLoading]}
              onPress={handleLogin}
              disabled={loading}
              activeOpacity={0.85}
            >
              {loading ? (
                <View style={styles.signInBtnContent}>
                  <ActivityIndicator size="small" color={colors.white} />
                  <Text style={styles.signInBtnText}>Authenticating…</Text>
                </View>
              ) : (
                <View style={styles.signInBtnContent}>
                  <Text style={styles.signInBtnText}>Sign In</Text>
                  <MaterialCommunityIcons name="arrow-right" size={18} color={colors.white} />
                </View>
              )}
            </TouchableOpacity>

            {/* Support Note */}
            <Text style={styles.supportNote}>
              Having trouble? Contact your system administrator.
            </Text>

            {/* Divider */}
            <View style={styles.divider}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>SECURE ACCESS</Text>
              <View style={styles.dividerLine} />
            </View>

            {/* Feature List */}
            <View style={styles.featureList}>
              {[
                { icon: "shield-check-outline", text: "Secure JWT Authentication", color: "#10B981" },
                { icon: "sync", text: "Offline-First with Automatic Sync", color: "#3B82F6" },
                { icon: "map-marker-radius-outline", text: "Multi-Farm Field Operations", color: colors.brand },
              ].map((f) => (
                <View key={f.text} style={styles.featureItem}>
                  <View style={[styles.featureIconWrap, { backgroundColor: f.color + "12" }]}>
                    <MaterialCommunityIcons name={f.icon as MCName} size={18} color={f.color} />
                  </View>
                  <Text style={styles.featureText}>{f.text}</Text>
                </View>
              ))}
            </View>
          </View>

          {/* Footer */}
          <View style={styles.footer}>
            <Text style={styles.footerText}>© 2026 Jokas Farms · AKOKO SOLUTIONS</Text>
            <Text style={styles.footerVersion}>v2.0.0</Text>
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
    paddingBottom: 55,
    paddingHorizontal: spacing.xl,
    gap: spacing.sm,
    overflow: "hidden",
  },
  deco: {
    position: "absolute",
    borderRadius: radius.full,
    backgroundColor: "rgba(255, 255, 255, 0.08)",
  },
  decoTop: { width: 240, height: 240, top: -80, left: -60 },
  decoBottom: { width: 180, height: 180, bottom: -40, right: -50 },

  logoOuter: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: "rgba(255, 255, 255, 0.12)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.xs,
    borderWidth: 1.5,
    borderColor: "rgba(255, 255, 255, 0.2)",
  },
  logoMid: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "rgba(255, 255, 255, 0.18)",
    alignItems: "center",
    justifyContent: "center",
  },
  logoInner: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.white,
    alignItems: "center",
    justifyContent: "center",
    ...shadow.lg,
  },

  brand: {
    fontSize: font.size.xl,
    fontWeight: font.weight.extrabold,
    color: colors.white,
    letterSpacing: 2.5,
    fontFamily: font.family.bold,
  },
  tagline: {
    fontSize: font.size.xs,
    color: "rgba(255, 255, 255, 0.8)",
    fontWeight: font.weight.bold,
    letterSpacing: 1.2,
  },

  tagRow: {
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: spacing.md,
    flexWrap: "wrap",
    justifyContent: "center",
  },
  tagPill: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.15)",
    borderRadius: radius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.2)",
    gap: spacing.xs,
  },
  tagText: {
    color: colors.white,
    fontSize: 11,
    fontFamily: font.family.semibold,
  },

  // ── Card ──────────────────────────────
  card: {
    backgroundColor: colors.bgCard,
    borderTopLeftRadius: radius.xxl,
    borderTopRightRadius: radius.xxl,
    marginTop: -28,
    paddingHorizontal: spacing.xxl,
    paddingTop: spacing.xxxl,
    paddingBottom: spacing.xxl,
    gap: spacing.lg,
    flex: 1,
    minHeight: 500,
  },

  cardHeader: { gap: 6, marginBottom: spacing.xs },
  cardTitle: {
    fontSize: font.size.xxl,
    fontFamily: font.family.extrabold,
    color: colors.ink,
  },
  cardSub: {
    fontSize: font.size.sm,
    color: colors.inkLight,
    fontFamily: font.family.regular,
  },

  errorBanner: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.errorBg,
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: "#FECACA",
    gap: spacing.sm,
  },
  errorBannerText: {
    flex: 1,
    fontSize: font.size.sm,
    color: colors.error,
    fontWeight: font.weight.semibold,
  },

  fieldGroup: { gap: 8 },
  labelRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  fieldLabel: {
    fontSize: font.size.sm,
    fontFamily: font.family.semibold,
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
  inputFilled: { borderColor: colors.brand, backgroundColor: "#FFFDF9" },
  inputError: { borderColor: colors.error, backgroundColor: colors.errorBg },
  input: {
    flex: 1,
    fontSize: font.size.md,
    color: colors.ink,
    fontFamily: font.family.regular,
    paddingVertical: spacing.sm,
  },
  eyeBtn: { padding: 4 },
  fieldError: {
    fontSize: font.size.xs,
    color: colors.error,
    fontWeight: font.weight.semibold,
  },

  signInBtn: {
    backgroundColor: colors.brand,
    borderRadius: radius.full,
    minHeight: 56,
    alignItems: "center",
    justifyContent: "center",
    marginTop: spacing.sm,
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
    fontFamily: font.family.bold,
    letterSpacing: 0.5,
  },

  supportNote: {
    textAlign: "center",
    fontSize: font.size.xs,
    color: colors.inkLight,
    marginTop: -spacing.xs,
    fontFamily: font.family.medium,
  },

  divider: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  dividerLine: { flex: 1, height: 1, backgroundColor: colors.border },
  dividerText: {
    fontSize: font.size.xs - 1,
    color: colors.inkLight,
    fontFamily: font.family.bold,
    letterSpacing: 1.5,
  },

  featureList: { gap: spacing.sm },
  featureItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: "#F8FAFC",
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  featureIconWrap: {
    width: 34,
    height: 34,
    borderRadius: radius.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  featureText: {
    fontSize: font.size.sm,
    color: colors.inkMid,
    fontFamily: font.family.medium,
  },

  footer: {
    backgroundColor: colors.bgCard,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: spacing.xxl,
    paddingVertical: spacing.xl,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  footerText: { fontSize: font.size.xs, color: colors.inkLight, fontFamily: font.family.medium },
  footerVersion: {
    fontSize: font.size.xs,
    color: colors.brand,
    fontFamily: font.family.semibold,
  },
});
