import { useEffect, useState } from "react";
import { Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { ScreenWrapper } from "../../components/ScreenWrapper";
import { FormField } from "../../components/FormField";
import { SelectField, SelectOption } from "../../components/SelectField";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { useSubmit } from "../../hooks/useSubmit";
import { fetchCustomers, fetchProducts } from "../../api/endpoints";
import { colors, font, radius, spacing } from "../../constants/theme";

type LineItem = { productId: string; productName: string; quantity: string; unitPrice: string };

export function SalesOrderScreen() {
  const navigation = useNavigation<any>();
  const [customerId, setCustomerId] = useState("");
  const [deliveryDate, setDeliveryDate] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<LineItem[]>([{ productId: "", productName: "", quantity: "1", unitPrice: "" }]);
  const [customers, setCustomers] = useState<SelectOption[]>([]);
  const [products, setProducts] = useState<SelectOption[]>([]);
  const [allProducts, setAllProducts] = useState<any[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    fetchCustomers().then((r) => {
      setCustomers(((r.data as any[]) ?? []).map((c) => ({ label: `${c.name} (${c.customerCode})`, value: c.id })));
    }).catch(() => {});
    fetchProducts().then((r) => {
      const prods = (r.data as any[]) ?? [];
      setAllProducts(prods);
      setProducts(prods.map((p) => ({ label: `${p.name} (${p.sku})`, value: p.id })));
    }).catch(() => {});
  }, []);

  function setLineProduct(idx: number, productId: string) {
    const prod = allProducts.find((p) => p.id === productId);
    setLines((prev) => prev.map((l, i) =>
      i === idx ? { ...l, productId, productName: prod?.name ?? "", unitPrice: String(prod?.unitPrice ?? "") } : l
    ));
  }

  function addLine() {
    setLines((prev) => [...prev, { productId: "", productName: "", quantity: "1", unitPrice: "" }]);
  }

  function removeLine(idx: number) {
    setLines((prev) => prev.filter((_, i) => i !== idx));
  }

  function updateLine(idx: number, key: keyof LineItem, value: string) {
    setLines((prev) => prev.map((l, i) => i === idx ? { ...l, [key]: value } : l));
  }

  const total = lines.reduce((sum, l) => sum + (Number(l.quantity) || 0) * (Number(l.unitPrice) || 0), 0);

  function validate() {
    const e: Record<string, string> = {};
    if (!customerId) e.customerId = "Select a customer";
    if (lines.some((l) => !l.productId)) e.lines = "All line items need a product";
    if (lines.some((l) => !l.quantity || Number(l.quantity) <= 0)) e.lines = "All quantities must be > 0";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  const { submit, loading } = useSubmit({
    module: "sales_order",
    endpoint: "/sales/orders",
    onSuccess: () => Alert.alert("Saved", "Sales order created.", [{ text: "OK", onPress: () => navigation.goBack() }])
  });

  return (
    <ScreenWrapper>
      <Text style={styles.title}>Sales Order</Text>
      <Text style={styles.sub}>Create a new sales order</Text>

      <SelectField label="Customer" value={customerId} options={customers} onChange={(v) => { setCustomerId(v); setErrors((e) => ({ ...e, customerId: "" })); }} error={errors.customerId} required placeholder="Select customer…" />
      <FormField label="Requested Delivery Date" value={deliveryDate} onChangeText={setDeliveryDate} keyboardType="numeric" placeholder="YYYY-MM-DD (optional)" />

      <Text style={styles.sectionLabel}>Order Lines</Text>
      {errors.lines && <Text style={styles.lineError}>{errors.lines}</Text>}

      {lines.map((line, idx) => (
        <Card key={idx} style={styles.lineCard}>
          <View style={styles.lineHeader}>
            <Text style={styles.lineNum}>Line {idx + 1}</Text>
            {lines.length > 1 && (
              <TouchableOpacity onPress={() => removeLine(idx)}>
                <Text style={styles.removeBtn}>Remove</Text>
              </TouchableOpacity>
            )}
          </View>
          <SelectField label="Product" value={line.productId} options={products} onChange={(v) => setLineProduct(idx, v)} placeholder="Select product…" />
          <View style={styles.row}>
            <View style={styles.half}>
              <FormField label="Qty" value={line.quantity} onChangeText={(v) => updateLine(idx, "quantity", v)} keyboardType="decimal-pad" />
            </View>
            <View style={styles.half}>
              <FormField label="Unit Price (GHS)" value={line.unitPrice} onChangeText={(v) => updateLine(idx, "unitPrice", v)} keyboardType="decimal-pad" placeholder="0.00" />
            </View>
          </View>
          <Text style={styles.lineTotal}>Subtotal: GHS {((Number(line.quantity) || 0) * (Number(line.unitPrice) || 0)).toFixed(2)}</Text>
        </Card>
      ))}

      <TouchableOpacity style={styles.addLine} onPress={addLine}>
        <Text style={styles.addLineText}>+ Add Line Item</Text>
      </TouchableOpacity>

      <Card style={styles.totalCard}>
        <Text style={styles.totalLabel}>Order Total</Text>
        <Text style={styles.totalValue}>GHS {total.toFixed(2)}</Text>
      </Card>

      <FormField label="Notes" value={notes} onChangeText={setNotes} multiline numberOfLines={2} style={{ minHeight: 70, textAlignVertical: "top" } as any} placeholder="Optional delivery instructions…" />

      <Button label="Submit Order" loading={loading} onPress={async () => {
        if (!validate()) return;
        await submit({
          customerId,
          requestedDeliveryDate: deliveryDate || undefined,
          notes: notes || undefined,
          items: lines.map((l) => ({
            inventoryItemId: l.productId,
            quantity: Number(l.quantity),
            unitPrice: Number(l.unitPrice)
          }))
        });
      }} size="lg" />
    </ScreenWrapper>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: font.size.xl, fontWeight: font.weight.bold, color: colors.ink },
  sub: { fontSize: font.size.sm, color: colors.inkMid, marginTop: -spacing.sm },
  sectionLabel: { fontSize: font.size.sm, fontWeight: font.weight.bold, color: colors.inkMid, textTransform: "uppercase", letterSpacing: 0.5 },
  lineError: { fontSize: font.size.sm, color: colors.error },
  lineCard: { gap: spacing.md },
  lineHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  lineNum: { fontSize: font.size.sm, fontWeight: font.weight.semibold, color: colors.inkMid },
  removeBtn: { fontSize: font.size.sm, color: colors.error },
  row: { flexDirection: "row", gap: spacing.md },
  half: { flex: 1 },
  lineTotal: { fontSize: font.size.sm, color: colors.inkMid, textAlign: "right" },
  addLine: {
    borderWidth: 1,
    borderColor: colors.brand,
    borderStyle: "dashed",
    borderRadius: radius.md,
    padding: spacing.md,
    alignItems: "center"
  },
  addLineText: { color: colors.brand, fontWeight: font.weight.semibold },
  totalCard: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  totalLabel: { fontSize: font.size.md, fontWeight: font.weight.semibold, color: colors.ink },
  totalValue: { fontSize: font.size.xl, fontWeight: font.weight.bold, color: colors.brand }
});
