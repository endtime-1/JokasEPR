import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Icon } from "../../components/Icon";
import { useToast } from "../../components/Toast";
import { fetchMyProfile, updateMyProfile, type MyProfileData } from "../../api/endpoints";
import { colors, font, radius, shadow, spacing } from "../../constants/theme";

function InfoRow({ label, value, icon }: { label: string; value: string; icon: string }) {
  return (
    <View style={styles.infoRow}>
      <View style={styles.infoIcon}>
        <Icon name={icon as any} size={16} color={colors.inkLight} />
      </View>
      <View style={styles.infoText}>
        <Text style={styles.infoLabel}>{label}</Text>
        <Text style={styles.infoValue}>{value || "—"}</Text>
      </View>
    </View>
  );
}

export function UserProfileScreen() {
  const toast = useToast();

  const [profile,    setProfile]    = useState<MyProfileData | null>(null);
  const [loading,    setLoading]    = useState(true);
  const [editing,    setEditing]    = useState(false);
  const [saving,     setSaving]     = useState(false);
  const [phone,      setPhone]      = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchMyProfile();
      setProfile(res.data as any);
      setPhone((res.data as any)?.phone ?? "");
    } catch {
      toast.show({ type: "error", message: "Could not load profile." });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleSave() {
    setSaving(true);
    try {
      await updateMyProfile({ phone: phone.trim() || undefined });
      toast.show({ type: "success", message: "Profile updated." });
      setEditing(false);
      load();
    } catch {
      toast.show({ type: "error", message: "Update failed. Try again." });
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.safe} edges={["bottom"]}>
        <View style={styles.center}><ActivityIndicator size="large" color={colors.brand} /></View>
      </SafeAreaView>
    );
  }

  if (!profile) {
    return (
      <SafeAreaView style={styles.safe} edges={["bottom"]}>
        <View style={styles.center}><Text style={styles.errText}>Profile unavailable.</Text></View>
      </SafeAreaView>
    );
  }

  const initials = profile.fullName.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase();
  const roleLabel = profile.roles[0]?.replace(/_/g, " ") ?? "USER";

  return (
    <SafeAreaView style={styles.safe} edges={["bottom"]}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

        {/* Avatar + name hero */}
        <View style={styles.hero}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{initials}</Text>
          </View>
          <Text style={styles.heroName}>{profile.fullName}</Text>
          <View style={styles.rolePill}>
            <Text style={styles.rolePillText}>{roleLabel}</Text>
          </View>
          {profile.code && <Text style={styles.heroCode}>{profile.code}</Text>}
        </View>

        {/* Contact info card */}
        <View style={styles.infoCard}>
          <Text style={styles.sectionTitle}>Contact Info</Text>
          <InfoRow label="Email"  value={profile.email}        icon="email-outline" />
          <View style={styles.divider} />

          {editing ? (
            <View style={styles.editRow}>
              <View style={styles.editIcon}>
                <Icon name="phone-outline" size={16} color={colors.inkLight} />
              </View>
              <View style={styles.editField}>
                <Text style={styles.infoLabel}>Phone</Text>
                <TextInput
                  style={styles.phoneInput}
                  value={phone}
                  onChangeText={setPhone}
                  placeholder="+233 xx xxx xxxx"
                  placeholderTextColor={colors.inkLight}
                  keyboardType="phone-pad"
                  autoFocus
                />
              </View>
            </View>
          ) : (
            <>
              <InfoRow label="Phone" value={profile.phone ?? ""} icon="phone-outline" />
              <TouchableOpacity style={styles.editPhoneBtn} onPress={() => setEditing(true)} activeOpacity={0.7}>
                <Icon name="pencil-outline" size={13} color={colors.brand} />
                <Text style={styles.editPhoneText}>Edit phone</Text>
              </TouchableOpacity>
            </>
          )}
        </View>

        {/* Org info */}
        <View style={styles.infoCard}>
          <Text style={styles.sectionTitle}>Organisation</Text>
          {profile.employeeRole && <InfoRow label="Job Role" value={profile.employeeRole.name} icon="briefcase-outline" />}
          {profile.branch && (
            <>
              {profile.employeeRole && <View style={styles.divider} />}
              <InfoRow label="Branch" value={profile.branch.name} icon="office-building-outline" />
            </>
          )}
          {profile.farm && (
            <>
              <View style={styles.divider} />
              <InfoRow label="Farm" value={profile.farm.name} icon="barn" />
            </>
          )}
        </View>

        {/* Save / cancel when editing */}
        {editing && (
          <View style={styles.saveRow}>
            <TouchableOpacity style={styles.cancelBtn} onPress={() => { setEditing(false); setPhone(profile.phone ?? ""); }}>
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.saveBtn} onPress={handleSave} disabled={saving} activeOpacity={0.8}>
              {saving ? <ActivityIndicator size="small" color={colors.white} /> : (
                <>
                  <Icon name="check" size={16} color={colors.white} />
                  <Text style={styles.saveText}>Save Changes</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        )}

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: colors.bg },
  scroll: { padding: spacing.xl, paddingBottom: spacing.xxxl, gap: spacing.md },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  errText: { fontSize: font.size.sm, color: colors.error },

  hero:        { alignItems: "center", gap: spacing.sm, paddingVertical: spacing.lg },
  avatar:      { width: 80, height: 80, borderRadius: 40, backgroundColor: colors.brand, alignItems: "center", justifyContent: "center", ...shadow.brand },
  avatarText:  { color: colors.white, fontSize: font.size.xxl, fontFamily: font.family.extrabold },
  heroName:    { fontSize: font.size.xl, fontFamily: font.family.extrabold, color: colors.ink },
  rolePill:    { paddingHorizontal: spacing.md, paddingVertical: 4, borderRadius: radius.full, backgroundColor: colors.brandLight, borderWidth: 1, borderColor: colors.brandMid },
  rolePillText:{ fontSize: font.size.xs, color: colors.brand, fontFamily: font.family.bold },
  heroCode:    { fontSize: font.size.xs, color: colors.inkLight, fontFamily: font.family.medium },

  infoCard:     { backgroundColor: colors.bgCard, borderRadius: radius.xl, borderWidth: 1, borderColor: colors.border, overflow: "hidden", ...shadow.sm },
  sectionTitle: { fontSize: font.size.xs, fontFamily: font.family.bold, color: colors.inkLight, textTransform: "uppercase", letterSpacing: 0.8, padding: spacing.lg, paddingBottom: spacing.sm },
  infoRow:      { flexDirection: "row", alignItems: "center", paddingHorizontal: spacing.lg, paddingVertical: spacing.md, gap: spacing.md },
  infoIcon:     { width: 32, height: 32, alignItems: "center", justifyContent: "center" },
  infoText:     { flex: 1, gap: 1 },
  infoLabel:    { fontSize: font.size.xs, color: colors.inkLight, fontFamily: font.family.medium },
  infoValue:    { fontSize: font.size.sm, fontFamily: font.family.semibold, color: colors.ink },
  divider:      { height: 1, backgroundColor: colors.border, marginLeft: spacing.lg + 32 + spacing.md },

  editRow:     { flexDirection: "row", alignItems: "flex-start", paddingHorizontal: spacing.lg, paddingVertical: spacing.md, gap: spacing.md },
  editIcon:    { width: 32, height: 32, alignItems: "center", justifyContent: "center", marginTop: 14 },
  editField:   { flex: 1, gap: 2 },
  phoneInput:  { borderWidth: 1, borderColor: colors.brand, borderRadius: radius.lg, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, fontSize: font.size.sm, fontFamily: font.family.regular, color: colors.ink, marginTop: 4 },

  editPhoneBtn: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: spacing.lg, paddingBottom: spacing.md },
  editPhoneText:{ fontSize: font.size.xs, color: colors.brand, fontFamily: font.family.semibold },

  saveRow:    { flexDirection: "row", gap: spacing.md },
  cancelBtn:  { flex: 1, paddingVertical: spacing.md, borderRadius: radius.xl, borderWidth: 1, borderColor: colors.border, alignItems: "center" },
  cancelText: { fontSize: font.size.sm, fontFamily: font.family.semibold, color: colors.inkMid },
  saveBtn:    { flex: 2, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm, paddingVertical: spacing.md, borderRadius: radius.xl, backgroundColor: colors.brand },
  saveText:   { fontSize: font.size.sm, fontFamily: font.family.bold, color: colors.white },
});
