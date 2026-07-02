import { useMemo, useState } from "react";
import { Alert, StyleSheet, Text, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { ScreenWrapper } from "../../components/ScreenWrapper";
import { FormCard } from "../../components/FormCard";
import { FormFooter } from "../../components/FormFooter";
import { FormField } from "../../components/FormField";
import { SelectField, SelectOption } from "../../components/SelectField";
import { useSubmit } from "../../hooks/useSubmit";
import { useLookup } from "../../hooks/useLookup";
import { fetchFinanceOptions } from "../../api/endpoints";
import { colors, font, radius, spacing } from "../../constants/theme";

const PAYMENT_METHODS: SelectOption[] = [
  { label: "Cash",           value: "CASH"           },
  { label: "Mobile Money",   value: "MOBILE_MONEY"   },
  { label: "Bank Transfer",  value: "BANK_TRANSFER"  },
  { label: "Cheque",         value: "CHEQUE"         },
];

export function ExpenseNewScreen() {
  const navigation = useNavigation<any>();

  const [categoryId,     setCategoryId]     = useState("");
  const [amount,         setAmount]         = useState("");
  const [expenseDate,    setExpenseDate]    = useState("");
  const [description,    setDescription]    = useState("");
  const [vendorName,     setVendorName]     = useState("");
  const [paymentMethod,  setPaymentMethod]  = useState("");
  const [branchId,       setBranchId]       = useState("");
  const [bankAccountId,  setBankAccountId]  = useState("");
  const [receiptRef,     setReceiptRef]     = useState("");
  const [notes,          setNotes]          = useState("");
  const [errors,         setErrors]         = useState<Record<string, string>>({});

  const { data: opts } = useLookup("finance_options", async () => {
    const r = await fetchFinanceOptions();
    return r.data;
  });

  const categories: SelectOption[] = useMemo(
    () => (opts?.expenseCategories ?? []).map((c) => ({ label: `${c.name} (${c.code ?? ""})`.trim(), value: c.id })),
    [opts]
  );
  const branches: SelectOption[] = useMemo(
    () => (opts?.branches ?? []).map((b) => ({ label: b.name, value: b.id })),
    [opts]
  );
  const bankAccounts: SelectOption[] = useMemo(
    () => (opts?.bankAccounts ?? []).map((a) => ({ label: `${a.name} — ${a.bankName}`, value: a.id })),
    [opts]
  );

  const amountNum = Number(amount) || 0;
  const requiresApproval = amountNum >= 5000;

  function validate() {
    const e: Record<string, string> = {};
    if (!categoryId)    e.categoryId   = "Select an expense category";
    if (!amount || amountNum <= 0) e.amount = "Enter a valid amount";
    if (!description)   e.description  = "Enter a description";
    if (!expenseDate)   e.expenseDate  = "Enter the expense date (YYYY-MM-DD)";
    if (!paymentMethod) e.paymentMethod = "Select a payment method";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  const { submit, loading } = useSubmit({
    module: "expense",
    endpoint: "/finance/expenses",
    onSuccess: () =>
      Alert.alert(
        "Expense Saved",
        requiresApproval
          ? "Your expense has been submitted and is pending approval (≥ GHS 5,000)."
          : "Expense has been recorded.",
        [{ text: "OK", onPress: () => navigation.goBack() }]
      ),
  });

  async function handleSubmit() {
    if (!validate()) return;
    await submit({
      categoryId,
      amount: amountNum,
      expenseDate,
      description,
      vendorName:    vendorName    || undefined,
      paymentMethod,
      branchId:      branchId      || undefined,
      bankAccountId: bankAccountId || undefined,
      receiptRef:    receiptRef    || undefined,
      notes:         notes         || undefined,
    });
  }

  return (
    <ScreenWrapper footer={<FormFooter saveLabel={requiresApproval ? "Submit for Approval" : "Save Expense"} onSave={handleSubmit} loading={loading} />}>
      <View style={styles.pageHeader}>
        <View style={styles.pageIconWrap}>
          <MaterialCommunityIcons name="credit-card-minus" size={22} color={colors.brand} />
        </View>
        <View>
          <Text style={styles.title}>New Expense</Text>
          <Text style={styles.sub}>Log a business expense</Text>
        </View>
      </View>

      {requiresApproval && amountNum > 0 && (
        <View style={styles.approvalBanner}>
          <Text style={styles.approvalText}>⚠ Expenses ≥ GHS 5,000 require manager approval</Text>
        </View>
      )}

      <FormCard label="EXPENSE DETAILS">
        <SelectField label="Expense Category" value={categoryId} options={categories}
          onChange={(v) => { setCategoryId(v); setErrors((e) => ({ ...e, categoryId: "" })); }}
          error={errors.categoryId} required placeholder="Select category…" />

        <FormField label="Amount (GHS)" value={amount}
          onChangeText={(v) => { setAmount(v); setErrors((e) => ({ ...e, amount: "" })); }}
          keyboardType="decimal-pad" required error={errors.amount} placeholder="0.00" />

        <FormField label="Expense Date" value={expenseDate}
          onChangeText={(v) => { setExpenseDate(v); setErrors((e) => ({ ...e, expenseDate: "" })); }}
          placeholder="YYYY-MM-DD" required error={errors.expenseDate} />

        <FormField label="Description" value={description}
          onChangeText={(v) => { setDescription(v); setErrors((e) => ({ ...e, description: "" })); }}
          required error={errors.description} placeholder="What was this expense for?" />

        <FormField label="Vendor / Payee Name" value={vendorName}
          onChangeText={setVendorName} placeholder="Optional" />

        <SelectField label="Payment Method" value={paymentMethod} options={PAYMENT_METHODS}
          onChange={(v) => { setPaymentMethod(v); setErrors((e) => ({ ...e, paymentMethod: "" })); }}
          error={errors.paymentMethod} required placeholder="Select method…" />
      </FormCard>

      <FormCard label="LOCATION">
        <SelectField label="Branch" value={branchId} options={branches}
          onChange={setBranchId} placeholder="Select branch (optional)" />

        <SelectField label="Bank Account" value={bankAccountId} options={bankAccounts}
          onChange={setBankAccountId} placeholder="Select account (optional)" />
      </FormCard>

      <FormCard label="NOTES">
        <FormField label="Receipt / Reference No." value={receiptRef}
          onChangeText={setReceiptRef} placeholder="Optional receipt number" />

        <FormField label="Notes" value={notes} onChangeText={setNotes}
          multiline numberOfLines={2}
          style={{ minHeight: 70, textAlignVertical: "top" } as any}
          placeholder="Optional notes…" />
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

  approvalBanner: {
    backgroundColor: "#fff7ed",
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: "#fed7aa",
  },
  approvalText: { fontSize: font.size.sm, color: "#c2410c", fontWeight: font.weight.medium },
});
