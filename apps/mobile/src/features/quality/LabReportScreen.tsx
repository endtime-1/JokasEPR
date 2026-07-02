import { useState } from "react";
import { Alert, StyleSheet, Text, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { ScreenWrapper } from "../../components/ScreenWrapper";
import { FormCard } from "../../components/FormCard";
import { FormFooter } from "../../components/FormFooter";
import { FormField } from "../../components/FormField";
import { useSubmit } from "../../hooks/useSubmit";
import { colors, font, radius, spacing } from "../../constants/theme";

export function LabReportScreen() {
  const navigation = useNavigation<any>();
  const today = new Date().toISOString().split("T")[0];

  const [reportNumber,      setReportNumber]      = useState("");
  const [labName,           setLabName]           = useState("");
  const [reportDate,        setReportDate]        = useState(today);
  const [fileUrl,           setFileUrl]           = useState("");
  const [summary,           setSummary]           = useState("");
  const [findings,          setFindings]          = useState("");
  const [recommendations,   setRecommendations]   = useState("");
  const [errors,            setErrors]            = useState<Record<string, string>>({});

  function validate() {
    const e: Record<string, string> = {};
    if (!reportNumber) e.reportNumber = "Enter the lab report number";
    if (!labName)      e.labName      = "Enter the lab name";
    if (!reportDate)   e.reportDate   = "Enter the report date";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  const { submit, loading } = useSubmit({
    module: "lab_report",
    endpoint: "/quality/lab-reports",
    onSuccess: () =>
      Alert.alert("Report Logged", "Lab report has been saved.", [{ text: "OK", onPress: () => navigation.goBack() }]),
  });

  async function handleSubmit() {
    if (!validate()) return;
    await submit({
      reportNumber,
      labName,
      reportDate,
      ...(fileUrl        ? { fileUrl, fileType: "URL" } : {}),
      ...(summary        ? { summary }        : {}),
      ...(findings       ? { findings }       : {}),
      ...(recommendations ? { recommendations } : {}),
    });
  }

  return (
    <ScreenWrapper footer={<FormFooter saveLabel="Save Lab Report" onSave={handleSubmit} loading={loading} />}>
      <View style={styles.pageHeader}>
        <View style={styles.pageIconWrap}>
          <MaterialCommunityIcons name="test-tube" size={22} color={colors.brand} />
        </View>
        <View>
          <Text style={styles.title}>Lab Report</Text>
          <Text style={styles.sub}>Log external lab analysis results</Text>
        </View>
      </View>

      <View style={styles.infoCard}>
        <Text style={styles.infoText}>
          ℹ Attach this report to a quality check via the web portal. On mobile, enter the report details and optionally paste a file share link.
        </Text>
      </View>

      <FormCard label="REPORT DETAILS">
        <View style={styles.row}>
          <View style={styles.half}>
            <FormField label="Report Number" value={reportNumber}
              onChangeText={(v) => { setReportNumber(v); setErrors((e) => ({ ...e, reportNumber: "" })); }}
              required error={errors.reportNumber} placeholder="e.g. LAB-2026-001" />
          </View>
          <View style={styles.half}>
            <FormField label="Report Date" value={reportDate}
              onChangeText={(v) => { setReportDate(v); setErrors((e) => ({ ...e, reportDate: "" })); }}
              required error={errors.reportDate} placeholder="YYYY-MM-DD"
              keyboardType="numbers-and-punctuation" />
          </View>
        </View>

        <FormField label="Lab / Testing Facility" value={labName}
          onChangeText={(v) => { setLabName(v); setErrors((e) => ({ ...e, labName: "" })); }}
          required error={errors.labName} placeholder="Name of lab that issued this report…" />

        <FormField label="File URL (optional)" value={fileUrl}
          onChangeText={setFileUrl}
          placeholder="Paste Google Drive / OneDrive share link…"
          keyboardType="url" autoCapitalize="none" autoCorrect={false} />

        {fileUrl.length > 0 && (
          <View style={styles.linkPreview}>
            <Text style={styles.linkPreviewIcon}>📎</Text>
            <Text style={styles.linkPreviewText} numberOfLines={1}>{fileUrl}</Text>
          </View>
        )}
      </FormCard>

      <FormCard label="FINDINGS">
        <FormField label="Summary (optional)" value={summary}
          onChangeText={setSummary} multiline numberOfLines={2}
          style={{ minHeight: 60, textAlignVertical: "top" } as any}
          placeholder="Brief summary of test results…" />

        <FormField label="Findings (optional)" value={findings}
          onChangeText={setFindings} multiline numberOfLines={3}
          style={{ minHeight: 80, textAlignVertical: "top" } as any}
          placeholder="Key findings from the lab analysis…" />

        <FormField label="Recommendations (optional)" value={recommendations}
          onChangeText={setRecommendations} multiline numberOfLines={2}
          style={{ minHeight: 60, textAlignVertical: "top" } as any}
          placeholder="Recommended actions based on findings…" />
      </FormCard>
    </ScreenWrapper>
  );
}

const styles = StyleSheet.create({
  pageHeader:   { flexDirection: "row", alignItems: "center", gap: 12 },
  pageIconWrap: {
    width: 48, height: 48, borderRadius: 12,
    backgroundColor: colors.brandLight,
    borderWidth: 1, borderColor: colors.brandMid,
    alignItems: "center", justifyContent: "center",
  },
  title: { fontSize: font.size.xl, fontFamily: font.family.extrabold, color: colors.ink },
  sub:   { fontSize: font.size.sm, color: colors.inkMid, fontFamily: font.family.regular },

  infoCard: { backgroundColor: "#eff6ff", borderRadius: radius.md, borderWidth: 1, borderColor: "#bfdbfe", padding: spacing.md },
  infoText: { fontSize: font.size.sm, color: "#1d4ed8", lineHeight: 19 },

  row:  { flexDirection: "row", gap: spacing.md },
  half: { flex: 1 },

  linkPreview: {
    flexDirection: "row", alignItems: "center", gap: spacing.sm,
    backgroundColor: colors.brandLight, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.brandMid, padding: spacing.md,
  },
  linkPreviewIcon: { fontSize: 16 },
  linkPreviewText: { flex: 1, fontSize: font.size.xs, color: colors.brand },
});
