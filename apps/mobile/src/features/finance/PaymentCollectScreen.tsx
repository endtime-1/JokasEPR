import { useMemo, useState } from "react";
import { Alert, StyleSheet, Text, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { ScreenWrapper } from "../../components/ScreenWrapper";
import { FormField } from "../../components/FormField";
import { SelectField, SelectOption } from "../../components/SelectField";
import { Button } from "../../components/Button";
import { useSubmit } from "../../hooks/useSubmit";
import { useLookup } from "../../hooks/useLookup";
import { fetchCustomers, fetchFinanceOptions } from "../../api/endpoints";
import { colors, font, radius, spacing } from "../../constants/theme";

const PAYMENT_METHODS: SelectOption[] = [
  { label: "Cash",          value: "CASH"          },
  { label: "Mobile Money",  value: "MOBILE_MONEY"  },
  { label: "Bank Transfer", value: "BANK_TRANSFER" },
  { label: "Cheque",        value: "CHEQUE"        },
];

export function PaymentCollectScreen() {
  const navigation = useNavigation<any>();

  const [customerId,    setCustomerId]    = useState("");
  const [customerName,  setCustomerName]  = useState("");
  const [amount,        setAmount]        = useState("");
  const [paymentDate,   setPaymentDate]   = useState("");
  const [paymentMethod, setPaymentMethod] = useState("");
  const [invoiceRef,    setInvoiceRef]    = useState("");
  const [bankAccountId, setBankAccountId] = useState("");
  const [description,   setDescription]  = useState("");
  const [notes,         setNotes]         = useState("");
  const [errors,        setErrors]        = useState<Record<string, string>>({});

  const { data: rawCustomers } = useLookup("customers", async () => {
    const r = await fetchCustomers();
    return (r.data as any[]) ?? [];
  });
  const customers: SelectOption[] = useMemo(
    () => (rawCustomers ?? []).map((c: any) => ({ label: `${c.name} (${c.code})`, value: c.id, meta: c.name })),
    [rawCustomers]
  );

  const { data: opts } = useLookup("finance_options", async () => {
    const r = await fetchFinanceOptions();
    return r.data;
  });
  const bankAccounts: SelectOption[] = useMemo(
    () => (opts?.bankAccounts ?? []).map((a) => ({ label: `${a.name} — ${a.bankName}`, value: a.id })),
    [opts]
  );

  function onCustomerChange(id: string) {
    setCustomerId(id);
    const found = (rawCustomers ?? []).find((c: any) => c.id === id);
    setCustomerName(found?.name ?? "");
    setErrors((e) => ({ ...e, customerId: "" }));
  }

  const amountNum = Number(amount) || 0;

  function validate() {
    const e: Record<string, string> = {};
    if (!customerId)    e.customerId    = "Select a customer";
    if (!amount || amountNum <= 0) e.amount = "Enter a valid amount";
    if (!paymentDate)   e.paymentDate   = "Enter payment date (YYYY-MM-DD)";
    if (!paymentMethod) e.paymentMethod = "Select a payment method";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  const { submit, loading } = useSubmit({
    module: "customer_payment",
    endpoint: "/finance/customer-payments",
    onSuccess: () =>
      Alert.alert("Payment Recorded", `GHS ${amountNum.toFixed(2)} payment from ${customerName} has been saved.`,
        [{ text: "OK", onPress: () => navigation.goBack() }]
      ),
  });

  return (
    <ScreenWrapper>
      <View style={styles.pageHeader}>
        <View style={styles.pageIconWrap}>
          <Text style={styles.pageIconText}>💳</Text>
        </View>
        <View style={styles.pageHeaderText}>
          <Text style={styles.pageTitle}>Collect Payment</Text>
          <Text style={styles.pageSub}>Record a customer payment</Text>
        </View>
      </View>

      <SelectField label="Customer" value={customerId} options={customers}
        onChange={onCustomerChange}
        error={errors.customerId} required placeholder="Select customer…" />

      <FormField label="Amount (GHS)" value={amount}
        onChangeText={(v) => { setAmount(v); setErrors((e) => ({ ...e, amount: "" })); }}
        keyboardType="decimal-pad" required error={errors.amount} placeholder="0.00" />

      {amountNum > 0 && (
        <View style={styles.amountPreview}>
          <Text style={styles.amountLabel}>Payment Total</Text>
          <Text style={styles.amountValue}>
            GHS {amountNum.toLocaleString("en-GH", { minimumFractionDigits: 2 })}
          </Text>
        </View>
      )}

      <FormField label="Payment Date" value={paymentDate}
        onChangeText={(v) => { setPaymentDate(v); setErrors((e) => ({ ...e, paymentDate: "" })); }}
        placeholder="YYYY-MM-DD" required error={errors.paymentDate} />

      <SelectField label="Payment Method" value={paymentMethod} options={PAYMENT_METHODS}
        onChange={(v) => { setPaymentMethod(v); setErrors((e) => ({ ...e, paymentMethod: "" })); }}
        error={errors.paymentMethod} required placeholder="Select method…" />

      <FormField label="Invoice Reference" value={invoiceRef}
        onChangeText={setInvoiceRef} placeholder="INV-2026-0001 (optional)" />

      <SelectField label="Received Into Account" value={bankAccountId} options={bankAccounts}
        onChange={setBankAccountId} placeholder="Select bank account (optional)" />

      <FormField label="Description" value={description}
        onChangeText={setDescription} placeholder="Optional payment note" />

      <FormField label="Notes" value={notes} onChangeText={setNotes}
        multiline numberOfLines={2}
        style={{ minHeight: 70, textAlignVertical: "top" } as any}
        placeholder="Internal notes…" />

      <Button label="Record Payment" loading={loading} size="lg"
        onPress={async () => {
          if (!validate()) return;
          await submit({
            customerName,
            amount: amountNum,
            paymentDate,
            paymentMethod,
            invoiceRef:    invoiceRef    || undefined,
            bankAccountId: bankAccountId || undefined,
            description:   description   || undefined,
            notes:         notes         || undefined,
          });
        }} />
    </ScreenWrapper>
  );
}

const styles = StyleSheet.create({
  pageHeader:     { flexDirection: "row", alignItems: "center", gap: spacing.md },
  pageIconWrap:   { width: 52, height: 52, borderRadius: radius.lg, backgroundColor: colors.brandLight, borderWidth: 1, borderColor: colors.brandMid, alignItems: "center", justifyContent: "center" },
  pageIconText:   { fontSize: 26 },
  pageHeaderText: { gap: 2 },
  pageTitle:      { fontSize: font.size.xl, fontWeight: font.weight.extrabold, color: colors.ink },
  pageSub:        { fontSize: font.size.sm, color: colors.inkLight },

  amountPreview: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: colors.brandLight,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.brandMid,
    padding: spacing.lg,
  },
  amountLabel: { fontSize: font.size.md, fontWeight: font.weight.semibold, color: colors.brandDark },
  amountValue: { fontSize: font.size.xxl, fontWeight: font.weight.extrabold, color: colors.brand },
});
