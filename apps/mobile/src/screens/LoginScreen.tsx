import { useState } from "react";
import { Alert, Image, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "../auth/AuthContext";
import { FormField } from "../components/FormField";
import { Button } from "../components/Button";
import { colors, font, radius, spacing } from "../constants/theme";

export function LoginScreen() {
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});

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
    if (!validate()) return;
    setLoading(true);
    try {
      await login(email.trim().toLowerCase(), password);
    } catch (err) {
      Alert.alert("Sign-in failed", err instanceof Error ? err.message : "Check your credentials and try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView style={styles.fill} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
          <View style={styles.header}>
            <View style={styles.logo}>
              <Text style={styles.logoText}>J</Text>
            </View>
            <Text style={styles.brand}>Jokas ERP</Text>
            <Text style={styles.subtitle}>Farm Operations Mobile</Text>
          </View>

          <View style={styles.card}>
            <Text style={styles.title}>Sign in to your account</Text>
            <Text style={styles.hint}>Use your Jokas ERP credentials</Text>

            <View style={styles.form}>
              <FormField
                label="Email address"
                required
                value={email}
                onChangeText={(t) => { setEmail(t); setErrors((e) => ({ ...e, email: undefined })); }}
                error={errors.email}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="next"
                placeholder="you@company.com"
              />
              <FormField
                label="Password"
                required
                value={password}
                onChangeText={(t) => { setPassword(t); setErrors((e) => ({ ...e, password: undefined })); }}
                error={errors.password}
                secureTextEntry
                returnKeyType="done"
                onSubmitEditing={handleLogin}
                placeholder="••••••••"
              />
              <Button
                label="Sign in"
                loading={loading}
                onPress={handleLogin}
                size="lg"
              />
            </View>
          </View>

          <Text style={styles.footer}>Jokas Multi-Farm ERP · v0.1</Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  fill: { flex: 1 },
  container: { flexGrow: 1, padding: spacing.xl, justifyContent: "center", gap: spacing.xl },
  header: { alignItems: "center", gap: spacing.sm },
  logo: {
    width: 72, height: 72,
    borderRadius: radius.lg,
    backgroundColor: colors.brand,
    alignItems: "center", justifyContent: "center"
  },
  logoText: { color: "#fff", fontSize: font.size.xxxl, fontWeight: font.weight.bold },
  brand: { fontSize: font.size.xl, fontWeight: font.weight.bold, color: colors.ink },
  subtitle: { fontSize: font.size.sm, color: colors.inkMid },
  card: {
    backgroundColor: colors.bgCard,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.xl,
    gap: spacing.md
  },
  title: { fontSize: font.size.lg, fontWeight: font.weight.bold, color: colors.ink },
  hint: { fontSize: font.size.sm, color: colors.inkLight, marginBottom: spacing.xs },
  form: { gap: spacing.lg },
  footer: { textAlign: "center", fontSize: font.size.xs, color: colors.inkLight }
});
