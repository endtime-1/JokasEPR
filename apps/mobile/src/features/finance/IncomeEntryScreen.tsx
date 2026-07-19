import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { Icon } from "../../components/Icon";
import { PageHeader } from "../../components/PageHeader";
import { useToast } from "../../components/Toast";
import { fetchFinanceOptions, submitIncomeEntry, type FinanceOptions } from "../../api/endpoints";
import { colors, font, radius, shadow, spacing } from "../../constants/theme";

type FinanceOptionData = FinanceOptions["data"];

const REVENUE_SOURCES = [
  { value: "PRODUCT_SALES",    label: "Product Sales",     icon: "package-variant" as const },
  { value: "SERVICE_FEES",     label: "Service Fees",       icon: "tools"           as const },
  { value: "RENTAL_INCOME",    label: "Rental Income",      icon: "home-city"       as const },
  { value: "INVESTMENT_INCOME",label: "Investment Income",  icon: "chart-line"      as const },
  { value: "OTHER",            label: "Other",              icon: "cash-multiple"   as const },
];

const PAYMENT_METHODS = [
  { value: "CASH",          label: "Cash"          },
  { value: "BANK_TRANSFER", label: "Bank Transfer" },
  { value: "MOBILE_MONEY",  label: "Mobile Money"  },
  { value: "CHEQUE",        label: "Cheque"        },
];

export function IncomeEntryScreen() {
  const navigation = useNavigation<any>();
  const toast      = useToast();

  const [options,    setOptions]    = useState<FinanceOptionData | null>(null);
  const [loading,    setLoading]    = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const [source,       setSource]       = useState("PRODUCT_SALES");
  const [description,  setDescription]  = useState("");
  const [amount,       setAmount]       = useState("");
  const [revenueDate,  setRevenueDate]  = useState(new Date().toISOString().slice(0, 10));
  const [paymentMethod,setPaymentMethod] = useState("CASH");
  const [customerName, setCustomerName] = useState("");
  const [invoiceRef,   setInvoiceRef]   = useState("");
  const [branchId,     setBranchId]     = useState<string | null>(null);
  const [bankAccountId,setBankAccountId] = useState<string | null>(null);
  const [notes,        setNotes]        = useState("");

  const load = useCallback(async () => {
    try {
      const res = await fetchFinanceOptions();
      setOptions(res.data);
      if (res.data.branches?.length) setBranchId(res.data.branches[0].id);
    } catch {
      toast.show({ type: "warning", message: "Could not load options; some fields may be limited." });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleSubmit() {
    if (!description.trim()) { toast.show({ type: "warning", message: "Description is required." }); return; }
    const amt = Number(amount);
    if (!amt || amt <= 0) { toast.show({ type: "warning", message: "Enter a valid amount greater than 0." }); return; }
    if (!revenueDate) { toast.show({ type: "warning", message: "Select a revenue date." }); return; }

    setSubmitting(true);
    try {
      await submitIncomeEntry({
        source,
        description:   description.trim(),
        amount:        amt,
        revenueDate,
        paymentMethod,
        customerName:  customerName.trim() || undefined,
        invoiceRef:    invoiceRef.trim() || undefined,
        branchId:      branchId || undefined,
        bankAccountId: bankAccountId || undefined,
        notes:         notes.trim() || undefined,
      });
      toast.show({ type: "success", message: "Income entry recorded." });
      navigation.goBack();
    } catch {
      toast.show({ type: "error", message: "Failed to record income. Try again." });
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.safe} edges={["bottom"]}>
        <View style={styles.center}><ActivityIndicator size="large" color={colors.brand} /></View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={["bottom"]}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <PageHeader icon="cash-multiple" iconColor="#16a34a" title="Record Income" />

        {/* Revenue source */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>REVENUE SOURCE *</Text>
          <View style={styles.sourceGrid}>
            {REVENUE_SOURCES.map((s) => (
              <TouchableOpacity
                key={s.value}
                style={[styles.sourceChip, source === s.value && styles.sourceChipActive]}
                onPress={() => setSource(s.value)}
                activeOpacity={0.75}
              >
                <Icon name={s.icon} size={18} color={source === s.value ? colors.brand : colors.inkMid} />
                <Text style={[styles.sourceLabel, source === s.value && styles.sourceLabelActive]}>{s.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Core details */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>TRANSACTION DETAILS *</Text>

          <View style={styles.fieldGroup}>
            <Text style={styles.label}>Description *</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. Feed sales to Kwame Farms"
              placeholderTextColor={colors.inkLight}
              value={description}
              onChangeText={setDescription}
            />
          </View>

          <View style={styles.rowFields}>
            <View style={[styles.fieldGroup, { flex: 1 }]}>
              <Text style={styles.label}>Amount (GHS) *</Text>
              <TextInput
                style={styles.input}
                placeholder="0.00"
                placeholderTextColor={colors.inkLight}
                keyboardType="numeric"
                value={amount}
                onChangeText={setAmount}
              />
            </View>
            <View style={[styles.fieldGroup, { flex: 1 }]}>
              <Text style={styles.label}>Date *</Text>
              <TextInput
                style={styles.input}
                placeholder="YYYY-MM-DD"
                placeholderTextColor={colors.inkLight}
                value={revenueDate}
                onChangeText={setRevenueDate}
              />
            </View>
          </View>
        </View>

        {/* Payment method */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>PAYMENT METHOD</Text>
          <View style={styles.pillRow}>
            {PAYMENT_METHODS.map((m) => (
              <TouchableOpacity
                key={m.value}
                style={[styles.pill, paymentMethod === m.value && styles.pillActive]}
                onPress={() => {
                  setPaymentMethod(m.value);
                  if (m.value !== "BANK_TRANSFER" && m.value !== "MOBILE_MONEY") setBankAccountId(null);
                }}
              >
                <Text style={[styles.pillText, paymentMethod === m.value && styles.pillTextActive]}>{m.label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {(paymentMethod === "BANK_TRANSFER" || paymentMethod === "MOBILE_MONEY" || paymentMethod === "CHEQUE") &&
            (options?.bankAccounts?.length ?? 0) > 0 && (
            <View style={styles.fieldGroup}>
              <Text style={styles.label}>Bank Account</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipScroll}>
                {options!.bankAccounts.map((b) => (
                  <TouchableOpacity
                    key={b.id}
                    style={[styles.accountChip, bankAccountId === b.id && styles.accountChipActive]}
                    onPress={() => setBankAccountId(b.id)}
                  >
                    <Text style={[styles.accountChipText, bankAccountId === b.id && styles.accountChipTextActive]} numberOfLines={1}>
                      {b.bankName} – {b.name}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          )}
        </View>

        {/* Optional details */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>OPTIONAL DETAILS</Text>

          <View style={styles.fieldGroup}>
            <Text style={styles.label}>Customer Name</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. Kwame Farms Ltd"
              placeholderTextColor={colors.inkLight}
              value={customerName}
              onChangeText={setCustomerName}
            />
          </View>

          <View style={styles.fieldGroup}>
            <Text style={styles.label}>Invoice / Reference No.</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. INV-2024-0042"
              placeholderTextColor={colors.inkLight}
              value={invoiceRef}
              onChangeText={setInvoiceRef}
            />
          </View>

          {(options?.branches?.length ?? 0) > 1 && (
            <View style={styles.fieldGroup}>
              <Text style={styles.label}>Branch</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipScroll}>
                {options!.branches.map((b) => (
                  <TouchableOpacity
                    key={b.id}
                    style={[styles.accountChip, branchId === b.id && styles.accountChipActive]}
                    onPress={() => setBranchId(b.id)}
                  >
                    <Text style={[styles.accountChipText, branchId === b.id && styles.accountChipTextActive]}>{b.name}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          )}

          <View style={styles.fieldGroup}>
            <Text style={styles.label}>Notes</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              placeholder="Additional notes…"
              placeholderTextColor={colors.inkLight}
              multiline
              numberOfLines={3}
              value={notes}
              onChangeText={setNotes}
            />
          </View>
        </View>

        {/* Submit */}
        <TouchableOpacity style={styles.submitBtn} onPress={handleSubmit} disabled={submitting} activeOpacity={0.8}>
          {submitting ? (
            <ActivityIndicator size="small" color={colors.white} />
          ) : (
            <>
              <Icon name="cash-multiple" size={18} color={colors.white} />
              <Text style={styles.submitText}>Record Income</Text>
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
  center: { flex: 1, alignItems: "center", justifyContent: "center" },

  card:         { backgroundColor: colors.bgCard, borderRadius: radius.xl, borderWidth: 1, borderColor: colors.border, padding: spacing.lg, gap: spacing.md, ...shadow.sm },
  sectionTitle: { fontSize: font.size.xs, fontFamily: font.family.extrabold, color: colors.inkLight, textTransform: "uppercase", letterSpacing: 0.8 },

  sourceGrid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  sourceChip:       { flexDirection: "row", alignItems: "center", gap: spacing.xs, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.full, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.bg },
  sourceChipActive: { borderColor: colors.brand, backgroundColor: colors.brandLight },
  sourceLabel:      { fontSize: font.size.xs, fontFamily: font.family.semibold, color: colors.inkMid },
  sourceLabelActive:{ color: colors.brand, fontFamily: font.family.bold },

  fieldGroup: { gap: spacing.xs },
  rowFields:  { flexDirection: "row", gap: spacing.sm },
  label:      { fontSize: font.size.xs, fontFamily: font.family.semibold, color: colors.inkMid },
  input:      { borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, paddingHorizontal: spacing.md, paddingVertical: spacing.sm + 2, fontSize: font.size.sm, fontFamily: font.family.regular, color: colors.ink, backgroundColor: colors.bg },
  textArea:   { minHeight: 80, textAlignVertical: "top" },

  pillRow:        { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  pill:           { paddingHorizontal: spacing.md, paddingVertical: 8, borderRadius: radius.full, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.bg },
  pillActive:     { borderColor: colors.brand, backgroundColor: colors.brandLight },
  pillText:       { fontSize: font.size.xs, fontFamily: font.family.semibold, color: colors.inkMid },
  pillTextActive: { color: colors.brand, fontFamily: font.family.bold },

  chipScroll:      { gap: spacing.sm, paddingVertical: 2 },
  accountChip:     { paddingHorizontal: spacing.md, paddingVertical: 6, borderRadius: radius.full, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.bg, maxWidth: 200 },
  accountChipActive: { borderColor: colors.brand, backgroundColor: colors.brandLight },
  accountChipText:   { fontSize: font.size.xs, fontFamily: font.family.medium, color: colors.inkMid },
  accountChipTextActive: { color: colors.brand, fontFamily: font.family.bold },

  submitBtn:  { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm, backgroundColor: "#16a34a", borderRadius: radius.xl, paddingVertical: spacing.lg },
  submitText: { fontSize: font.size.md, fontFamily: font.family.bold, color: colors.white },
});
