import { useMemo, useState } from "react";
import { Alert, StyleSheet, Text, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { ScreenWrapper } from "../../components/ScreenWrapper";
import { FormCard } from "../../components/FormCard";
import { FormFooter } from "../../components/FormFooter";
import { FormField } from "../../components/FormField";
import { DateField } from "../../components/DateField";
import { SelectField, SelectOption } from "../../components/SelectField";
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
  const [invoiceId,     setInvoiceId]     = useState("");
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

  // Mobile parity audit (2026-08-17): only outstanding invoices for the
  // selected customer — matches what CreatePaymentDto.invoiceId actually
  // accepts server-side (balanceDue > 0, same customer).
  const customerInvoices: SelectOption[] = useMemo(
    () =>
      (opts?.invoices ?? [])
        .filter((inv) => inv.customerId === customerId)
        .map((inv) => ({ label: `${inv.invoiceNumber} — GHS ${Number(inv.balanceDue).toFixed(2)} due`, value: inv.id })),
    [opts, customerId]
  );

  function onCustomerChange(id: string) {
    setCustomerId(id);
    const found = (rawCustomers ?? []).find((c: any) => c.id === id);
    setCustomerName(found?.name ?? "");
    setInvoiceId("");
    setErrors((e) => ({ ...e, customerId: "" }));
  }

  const amountNum = Number(amount) || 0;

  function validate() {
    const e: Record<string, string> = {};
    if (!customerId)    e.customerId    = "Select a customer";
    if (!amount || amountNum <= 0) e.amount = "Enter a valid amount";
    if (!paymentDate)   e.paymentDate   = "Enter payment date (YYYY-MM-DD)";
    if (!paymentMethod) e.paymentMethod = "Select a payment method";
    // Mobile parity audit (2026-08-17): CreateCustomerPaymentDto.description
    // is required server-side (no @IsOptional) — every other required field
    // here has a matching validate() check and a visible required marker,
    // this one had neither, so a user filling only the asterisked fields
    // still got rejected with no indication why.
    if (!description.trim()) e.description = "Enter a description for this payment";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  const { submit, loading } = useSubmit({
    module: "customer_payment",
    endpoint: "/finance/customer-payments",
    sendIdempotencyKeyInBody: true,
    onSuccess: (queued) =>
      Alert.alert(
        queued ? "Saved Offline" : "Payment Recorded",
        queued
          ? `The GHS ${amountNum.toFixed(2)} payment from ${customerName} was saved on this device and will sync automatically once you're back online.`
          : `GHS ${amountNum.toFixed(2)} payment from ${customerName} has been saved.`,
        [{ text: "OK", onPress: () => navigation.goBack() }]
      ),
  });

  async function handleSubmit() {
    if (!validate()) return;
    await submit({
      customerName,
      amount: amountNum,
      paymentDate,
      paymentMethod,
      invoiceRef:    invoiceRef    || undefined,
      invoiceId:     invoiceId     || undefined,
      bankAccountId: bankAccountId || undefined,
      description:   description.trim(),
      notes:         notes         || undefined,
    });
  }

  return (
    <ScreenWrapper footer={<FormFooter saveLabel="Record Payment" onSave={handleSubmit} loading={loading} />}>
      <View style={styles.pageHeader}>
        <View style={styles.pageIconWrap}>
          <MaterialCommunityIcons name="credit-card-check" size={22} color={colors.brand} />
        </View>
        <View>
          <Text style={styles.title}>Collect Payment</Text>
          <Text style={styles.sub}>Record a customer payment</Text>
        </View>
      </View>

      <FormCard label="PAYMENT DETAILS">
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

        <DateField label="Payment Date" value={paymentDate}
          onChangeText={(v) => { setPaymentDate(v); setErrors((e) => ({ ...e, paymentDate: "" })); }}
          required error={errors.paymentDate} />

        <SelectField label="Payment Method" value={paymentMethod} options={PAYMENT_METHODS}
          onChange={(v) => { setPaymentMethod(v); setErrors((e) => ({ ...e, paymentMethod: "" })); }}
          error={errors.paymentMethod} required placeholder="Select method…" />

        <SelectField label="Apply to Invoice" value={invoiceId} options={customerInvoices}
          onChange={setInvoiceId}
          placeholder={customerId ? "Select outstanding invoice (optional)…" : "Select a customer first…"} />

        <FormField label="Invoice Reference" value={invoiceRef}
          onChangeText={setInvoiceRef} placeholder="INV-2026-0001 (optional, for invoices not tracked here)" />

        <SelectField label="Received Into Account" value={bankAccountId} options={bankAccounts}
          onChange={setBankAccountId} placeholder="Select bank account (optional)" />
      </FormCard>

      <FormCard label="NOTES">
        <FormField label="Description" value={description}
          onChangeText={(v) => { setDescription(v); setErrors((e) => ({ ...e, description: "" })); }}
          required error={errors.description} placeholder="e.g. Payment for invoice INV-2026-0001" />

        <FormField label="Notes" value={notes} onChangeText={setNotes}
          multiline numberOfLines={2}
          style={{ minHeight: 70, textAlignVertical: "top" } as any}
          placeholder="Internal notes…" />
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
  amountValue: { fontSize: font.size.xxl, fontWeight: font.weight.extrabold, color: colors.brandDark },
});
