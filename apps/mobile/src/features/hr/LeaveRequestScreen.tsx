import { useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { Icon } from "../../components/Icon";
import { PageHeader } from "../../components/PageHeader";
import { useToast } from "../../components/Toast";
import { submitLeaveRequest, type LeaveType } from "../../api/endpoints";
import { colors, font, radius, shadow, spacing } from "../../constants/theme";

const LEAVE_TYPES: { key: LeaveType; label: string; color: string; icon: string }[] = [
  { key: "ANNUAL",         label: "Annual Leave",        color: "#2563eb", icon: "umbrella-beach"         },
  { key: "SICK",           label: "Sick Leave",           color: "#dc2626", icon: "medical-bag"            },
  { key: "MATERNITY",      label: "Maternity Leave",      color: "#7c3aed", icon: "baby-carriage"          },
  { key: "PATERNITY",      label: "Paternity Leave",      color: "#0891b2", icon: "baby-face-outline"      },
  { key: "COMPASSIONATE",  label: "Compassionate Leave",  color: "#d97706", icon: "heart-outline"          },
  { key: "UNPAID",         label: "Unpaid Leave",         color: colors.inkMid, icon: "cash-off"           },
];

export function LeaveRequestScreen() {
  const navigation = useNavigation<any>();
  const toast = useToast();

  const [leaveType,  setLeaveType]  = useState<LeaveType | "">("");
  const [startDate,  setStartDate]  = useState("");
  const [endDate,    setEndDate]    = useState("");
  const [reason,     setReason]     = useState("");
  const [submitting, setSubmitting] = useState(false);

  const calcDays = (() => {
    if (!startDate || !endDate) return null;
    const s = new Date(startDate);
    const e = new Date(endDate);
    if (isNaN(s.getTime()) || isNaN(e.getTime()) || e < s) return null;
    return Math.round((e.getTime() - s.getTime()) / 86400000) + 1;
  })();

  async function handleSubmit() {
    if (!leaveType) { toast.show({ type: "warning", message: "Select a leave type." }); return; }
    if (!startDate) { toast.show({ type: "warning", message: "Enter a start date." }); return; }
    if (!endDate)   { toast.show({ type: "warning", message: "Enter an end date." });  return; }
    if (calcDays === null || calcDays <= 0) { toast.show({ type: "warning", message: "End date must be on or after start date." }); return; }
    if (!reason.trim()) { toast.show({ type: "warning", message: "Please provide a reason." }); return; }

    setSubmitting(true);
    try {
      await submitLeaveRequest({ leaveType, startDate, endDate, reason: reason.trim() });
      toast.show({ type: "success", message: "Leave request submitted successfully." });
      navigation.goBack();
    } catch {
      toast.show({ type: "error", message: "Submission failed. Try again." });
    } finally {
      setSubmitting(false);
    }
  }

  const selected = LEAVE_TYPES.find((t) => t.key === leaveType);

  return (
    <SafeAreaView style={styles.safe} edges={["bottom"]}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <PageHeader icon="calendar-plus" iconColor="#2563eb" title="Leave Request" subtitle="Submit a request for time off" />

        {/* Leave type grid */}
        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Leave Type *</Text>
          <View style={styles.typeGrid}>
            {LEAVE_TYPES.map((t) => (
              <TouchableOpacity
                key={t.key}
                style={[styles.typeCard, leaveType === t.key && { borderColor: t.color, backgroundColor: t.color + "10" }]}
                onPress={() => setLeaveType(t.key)}
                activeOpacity={0.8}
              >
                <Icon name={t.icon as any} size={22} color={leaveType === t.key ? t.color : colors.inkLight} />
                <Text style={[styles.typeLabel, leaveType === t.key && { color: t.color, fontFamily: font.family.bold }]}>{t.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Dates */}
        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Dates *</Text>
          <View style={styles.dateRow}>
            <View style={styles.dateField}>
              <Text style={styles.label}>Start Date</Text>
              <TextInput
                style={styles.input}
                placeholder="YYYY-MM-DD"
                placeholderTextColor={colors.inkLight}
                value={startDate}
                onChangeText={setStartDate}
              />
            </View>
            <View style={styles.dateSep}>
              <Icon name="arrow-right" size={18} color={colors.inkLight} />
            </View>
            <View style={styles.dateField}>
              <Text style={styles.label}>End Date</Text>
              <TextInput
                style={styles.input}
                placeholder="YYYY-MM-DD"
                placeholderTextColor={colors.inkLight}
                value={endDate}
                onChangeText={setEndDate}
              />
            </View>
          </View>
          {calcDays !== null && calcDays > 0 && (
            <View style={styles.daysChip}>
              <Icon name="calendar-check" size={14} color={selected?.color ?? colors.brand} />
              <Text style={[styles.daysText, { color: selected?.color ?? colors.brand }]}>{calcDays} working day{calcDays !== 1 ? "s" : ""}</Text>
            </View>
          )}
        </View>

        {/* Reason */}
        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Reason *</Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            placeholder="Briefly explain your reason for leave…"
            placeholderTextColor={colors.inkLight}
            multiline
            numberOfLines={4}
            value={reason}
            onChangeText={setReason}
          />
        </View>

        {/* Submit */}
        <TouchableOpacity style={[styles.submitBtn, selected && { backgroundColor: selected.color }]} onPress={handleSubmit} disabled={submitting} activeOpacity={0.8}>
          {submitting ? <ActivityIndicator size="small" color={colors.white} /> : (
            <>
              <Icon name="send-outline" size={18} color={colors.white} />
              <Text style={styles.submitText}>Submit Request</Text>
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

  sectionCard:  { backgroundColor: colors.bgCard, borderRadius: radius.xl, borderWidth: 1, borderColor: colors.border, padding: spacing.lg, gap: spacing.md, ...shadow.sm },
  sectionTitle: { fontSize: font.size.sm, fontFamily: font.family.extrabold, color: colors.inkLight, textTransform: "uppercase", letterSpacing: 0.8 },

  typeGrid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  typeCard: { width: "31%", alignItems: "center", gap: 6, paddingVertical: spacing.md, borderRadius: radius.lg, borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.bg },
  typeLabel:{ fontSize: 10, fontFamily: font.family.medium, color: colors.inkMid, textAlign: "center" },

  dateRow:   { flexDirection: "row", alignItems: "flex-end", gap: spacing.sm },
  dateField: { flex: 1, gap: spacing.xs },
  dateSep:   { paddingBottom: spacing.sm },
  label:     { fontSize: font.size.xs, fontFamily: font.family.semibold, color: colors.inkMid },
  input:     { borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, fontSize: font.size.sm, fontFamily: font.family.regular, color: colors.ink, backgroundColor: colors.bg },
  textArea:  { minHeight: 100, textAlignVertical: "top" },

  daysChip: { flexDirection: "row", alignItems: "center", gap: 5, alignSelf: "flex-start", paddingHorizontal: spacing.md, paddingVertical: 4, borderRadius: radius.full, backgroundColor: colors.brandLight, borderWidth: 1, borderColor: colors.brandMid },
  daysText: { fontSize: font.size.sm, fontFamily: font.family.bold },

  submitBtn:  { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm, backgroundColor: colors.brand, borderRadius: radius.xl, paddingVertical: spacing.lg },
  submitText: { fontSize: font.size.md, fontFamily: font.family.bold, color: colors.white },
});
