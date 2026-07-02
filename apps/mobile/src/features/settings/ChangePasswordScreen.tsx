import { useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { Icon } from "../../components/Icon";
import { PageHeader } from "../../components/PageHeader";
import { useToast } from "../../components/Toast";
import { changePassword } from "../../api/endpoints";
import { colors, font, radius, shadow, spacing } from "../../constants/theme";

export function ChangePasswordScreen() {
  const navigation = useNavigation<any>();
  const toast = useToast();

  const [current,   setCurrent]   = useState("");
  const [next,      setNext]      = useState("");
  const [confirm,   setConfirm]   = useState("");
  const [showCur,   setShowCur]   = useState(false);
  const [showNew,   setShowNew]   = useState(false);
  const [showCon,   setShowCon]   = useState(false);
  const [saving,    setSaving]    = useState(false);

  const strength = (() => {
    if (next.length === 0) return null;
    if (next.length < 6)  return { label: "Too short",  color: "#dc2626", pct: 25 };
    if (next.length < 8)  return { label: "Weak",       color: "#d97706", pct: 50 };
    if (!/[0-9]/.test(next) || !/[A-Z]/.test(next)) return { label: "Fair", color: "#ca8a04", pct: 65 };
    return { label: "Strong", color: "#16a34a", pct: 100 };
  })();

  async function handleSave() {
    if (!current.trim()) { toast.show({ type: "warning", message: "Enter your current password." }); return; }
    if (next.length < 6)  { toast.show({ type: "warning", message: "New password must be at least 6 characters." }); return; }
    if (next !== confirm)  { toast.show({ type: "warning", message: "Passwords do not match." }); return; }
    setSaving(true);
    try {
      await changePassword({ currentPassword: current, newPassword: next });
      toast.show({ type: "success", message: "Password changed successfully." });
      navigation.goBack();
    } catch {
      toast.show({ type: "error", message: "Failed. Check your current password and try again." });
    } finally {
      setSaving(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe} edges={["bottom"]}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <PageHeader icon="lock-reset" iconColor="#7c3aed" title="Change Password" subtitle="Keep your account secure" />

        <View style={styles.card}>
          <View style={styles.field}>
            <Text style={styles.label}>Current Password</Text>
            <View style={styles.inputWrap}>
              <TextInput
                style={styles.input}
                value={current}
                onChangeText={setCurrent}
                secureTextEntry={!showCur}
                placeholder="Enter current password"
                placeholderTextColor={colors.inkLight}
                autoComplete="current-password"
              />
              <TouchableOpacity onPress={() => setShowCur((v) => !v)} hitSlop={8}>
                <Icon name={showCur ? "eye-off-outline" : "eye-outline"} size={18} color={colors.inkLight} />
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.divider} />

          <View style={styles.field}>
            <Text style={styles.label}>New Password</Text>
            <View style={styles.inputWrap}>
              <TextInput
                style={styles.input}
                value={next}
                onChangeText={setNext}
                secureTextEntry={!showNew}
                placeholder="Enter new password"
                placeholderTextColor={colors.inkLight}
                autoComplete="new-password"
              />
              <TouchableOpacity onPress={() => setShowNew((v) => !v)} hitSlop={8}>
                <Icon name={showNew ? "eye-off-outline" : "eye-outline"} size={18} color={colors.inkLight} />
              </TouchableOpacity>
            </View>
            {strength && (
              <View style={styles.strengthRow}>
                <View style={styles.strengthBg}>
                  <View style={[styles.strengthFill, { width: `${strength.pct}%` as any, backgroundColor: strength.color }]} />
                </View>
                <Text style={[styles.strengthLabel, { color: strength.color }]}>{strength.label}</Text>
              </View>
            )}
          </View>

          <View style={styles.divider} />

          <View style={styles.field}>
            <Text style={styles.label}>Confirm New Password</Text>
            <View style={styles.inputWrap}>
              <TextInput
                style={[styles.input, confirm.length > 0 && next !== confirm && styles.inputError]}
                value={confirm}
                onChangeText={setConfirm}
                secureTextEntry={!showCon}
                placeholder="Repeat new password"
                placeholderTextColor={colors.inkLight}
              />
              <TouchableOpacity onPress={() => setShowCon((v) => !v)} hitSlop={8}>
                <Icon name={showCon ? "eye-off-outline" : "eye-outline"} size={18} color={colors.inkLight} />
              </TouchableOpacity>
            </View>
            {confirm.length > 0 && next !== confirm && (
              <Text style={styles.matchError}>Passwords do not match</Text>
            )}
          </View>
        </View>

        <View style={styles.hint}>
          <Icon name="information-outline" size={14} color={colors.inkLight} />
          <Text style={styles.hintText}>Use at least 8 characters with uppercase letters and numbers for a strong password.</Text>
        </View>

        <TouchableOpacity style={styles.saveBtn} onPress={handleSave} disabled={saving} activeOpacity={0.8}>
          {saving ? <ActivityIndicator size="small" color={colors.white} /> : (
            <>
              <Icon name="lock-check-outline" size={18} color={colors.white} />
              <Text style={styles.saveText}>Update Password</Text>
            </>
          )}
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: colors.bg },
  scroll: { padding: spacing.xl, paddingBottom: spacing.xxxl, gap: spacing.md },

  card:    { backgroundColor: colors.bgCard, borderRadius: radius.xl, borderWidth: 1, borderColor: colors.border, overflow: "hidden", ...shadow.sm },
  field:   { padding: spacing.lg, gap: spacing.sm },
  label:   { fontSize: font.size.xs, fontFamily: font.family.semibold, color: colors.inkMid, textTransform: "uppercase", letterSpacing: 0.6 },
  inputWrap: { flexDirection: "row", alignItems: "center", borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, backgroundColor: colors.bg, gap: spacing.sm },
  input:   { flex: 1, fontSize: font.size.sm, fontFamily: font.family.regular, color: colors.ink, padding: 0 },
  inputError: { borderColor: colors.error },
  divider: { height: 1, backgroundColor: colors.border },

  strengthRow:  { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginTop: 2 },
  strengthBg:   { flex: 1, height: 4, backgroundColor: colors.border, borderRadius: 2, overflow: "hidden" },
  strengthFill: { height: 4, borderRadius: 2 },
  strengthLabel:{ fontSize: font.size.xs, fontFamily: font.family.bold, minWidth: 55 },

  matchError: { fontSize: font.size.xs, color: colors.error, fontFamily: font.family.medium },

  hint:     { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm, paddingHorizontal: spacing.sm },
  hintText: { flex: 1, fontSize: font.size.xs, color: colors.inkLight, fontFamily: font.family.regular, lineHeight: 18 },

  saveBtn:  { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm, backgroundColor: "#7c3aed", borderRadius: radius.xl, paddingVertical: spacing.lg },
  saveText: { fontSize: font.size.md, fontFamily: font.family.bold, color: colors.white },
});
