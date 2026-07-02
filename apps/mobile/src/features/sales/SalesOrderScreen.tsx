import { useMemo, useState } from "react";
import { Alert, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { ScreenWrapper } from "../../components/ScreenWrapper";
import { FormCard } from "../../components/FormCard";
import { FormFooter } from "../../components/FormFooter";
import { FormField } from "../../components/FormField";
import { SelectField, SelectOption } from "../../components/SelectField";
import { useSubmit } from "../../hooks/useSubmit";
import { useLookup } from "../../hooks/useLookup";
import { fetchCustomers, fetchProducts, fetchWarehouses } from "../../api/endpoints";
import { colors, font, radius, shadow, spacing } from "../../constants/theme";

type LineItem = { productId: string; productName: string; quantity: string; unitPrice: string };

export function SalesOrderScreen() {
  const navigation = useNavigation<any>();
  const [customerId,   setCustomerId]   = useState("");
  const [warehouseId,  setWarehouseId]  = useState("");
  const [orderDate,    setOrderDate]    = useState("");
  const [notes,        setNotes]        = useState("");
  const [lines,        setLines]        = useState<LineItem[]>([{ productId: "", productName: "", quantity: "1", unitPrice: "" }]);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const { data: rawCustomers } = useLookup("customers", async () => { const r = await fetchCustomers(); return (r.data as any[]) ?? []; });
  const customers: SelectOption[] = useMemo(
    () => (rawCustomers ?? []).map((c: any) => ({ label: `${c.name} (${c.code})`, value: c.id })),
    [rawCustomers]
  );

  const { data: rawWarehouses } = useLookup("warehouses", async () => { const r = await fetchWarehouses(); return (r.data as any[]) ?? []; });
  const warehouses: SelectOption[] = useMemo(
    () => (rawWarehouses ?? []).map((w: any) => ({ label: w.name, value: w.id })),
    [rawWarehouses]
  );

  const { data: rawProducts } = useLookup("products", async () => { const r = await fetchProducts(); return (r.data as any[]) ?? []; });
  const products: SelectOption[] = useMemo(
    () => (rawProducts ?? []).map((p: any) => ({ label: `${p.name} (${p.sku})`, value: p.id })),
    [rawProducts]
  );

  function setLineProduct(idx: number, productId: string) {
    const prod = (rawProducts ?? []).find((p: any) => p.id === productId);
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
    if (!warehouseId) e.warehouseId = "Select a warehouse";
    if (lines.some((l) => !l.productId)) e.lines = "All line items need a product selected";
    if (lines.some((l) => !l.quantity || Number(l.quantity) <= 0)) e.lines = "All quantities must be greater than 0";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  const { submit, loading } = useSubmit({
    module: "sales_order",
    endpoint: "/sales/orders",
    onSuccess: () => Alert.alert("Order Created", "Sales order has been saved.", [{ text: "OK", onPress: () => navigation.goBack() }]),
  });

  async function handleSubmit() {
    if (!validate()) return;
    await submit({
      customerId,
      warehouseId,
      orderDate: orderDate || undefined,
      notes: notes || undefined,
      items: lines.map((l) => ({
        productId: l.productId,
        quantity: Number(l.quantity),
        unitPrice: Number(l.unitPrice),
      })),
    });
  }

  return (
    <ScreenWrapper footer={<FormFooter saveLabel="Submit Order" onSave={handleSubmit} loading={loading} />}>
      <View style={styles.pageHeader}>
        <View style={styles.pageIconWrap}>
          <MaterialCommunityIcons name="cart-plus" size={22} color={colors.brand} />
        </View>
        <View>
          <Text style={styles.title}>Sales Order</Text>
          <Text style={styles.sub}>Create a new customer sales order</Text>
        </View>
      </View>

      <FormCard label="ORDER DETAILS">
        <SelectField label="Customer" value={customerId} options={customers}
          onChange={(v) => { setCustomerId(v); setErrors((e) => ({ ...e, customerId: "" })); }}
          error={errors.customerId} required placeholder="Select customer…" />

        <SelectField label="Warehouse" value={warehouseId} options={warehouses}
          onChange={(v) => { setWarehouseId(v); setErrors((e) => ({ ...e, warehouseId: "" })); }}
          error={errors.warehouseId} required placeholder="Select warehouse…" />

        <FormField label="Order Date" value={orderDate} onChangeText={setOrderDate}
          keyboardType="numeric" placeholder="YYYY-MM-DD (optional)" />
      </FormCard>

      <FormCard label="ORDER LINES">
        <View style={styles.sectionHeader}>
          <View style={styles.sectionHeaderLeft}>
            <Text style={styles.sectionTitle}>ORDER LINES</Text>
            <View style={styles.sectionLine} />
          </View>
          <View style={styles.lineCountBadge}>
            <Text style={styles.lineCountText}>{lines.length}</Text>
          </View>
        </View>

        {errors.lines && (
          <View style={styles.lineErrorBanner}>
            <Text style={styles.lineErrorText}>⚠ {errors.lines}</Text>
          </View>
        )}

        {lines.map((line, idx) => (
          <View key={idx} style={styles.lineCard}>
            <View style={styles.lineCardHeader}>
              <View style={styles.lineNum}>
                <Text style={styles.lineNumText}>Line {idx + 1}</Text>
              </View>
              {line.productName !== "" && (
                <Text style={styles.lineProductPreview} numberOfLines={1}>{line.productName}</Text>
              )}
              {lines.length > 1 && (
                <TouchableOpacity onPress={() => removeLine(idx)} style={styles.removeBtn}>
                  <Text style={styles.removeBtnText}>Remove</Text>
                </TouchableOpacity>
              )}
            </View>

            <SelectField label="Product" value={line.productId} options={products}
              onChange={(v) => setLineProduct(idx, v)} placeholder="Select product…" />

            <View style={styles.row}>
              <View style={styles.half}>
                <FormField label="Quantity" value={line.quantity}
                  onChangeText={(v) => updateLine(idx, "quantity", v)} keyboardType="decimal-pad" />
              </View>
              <View style={styles.half}>
                <FormField label="Unit Price (GHS)" value={line.unitPrice}
                  onChangeText={(v) => updateLine(idx, "unitPrice", v)} keyboardType="decimal-pad" placeholder="0.00" />
              </View>
            </View>

            {line.quantity && line.unitPrice && (
              <Text style={styles.lineSubtotal}>
                Subtotal: GHS {((Number(line.quantity) || 0) * (Number(line.unitPrice) || 0)).toFixed(2)}
              </Text>
            )}
          </View>
        ))}

        <TouchableOpacity style={styles.addLineBtn} onPress={addLine}>
          <Text style={styles.addLineBtnText}>＋  Add Line Item</Text>
        </TouchableOpacity>

        {/* Order total */}
        <View style={styles.totalCard}>
          <View style={styles.totalLeft}>
            <Text style={styles.totalLabel}>Order Total</Text>
            <Text style={styles.totalLineCount}>{lines.length} line item{lines.length !== 1 ? "s" : ""}</Text>
          </View>
          <Text style={styles.totalValue}>GHS {total.toFixed(2)}</Text>
        </View>
      </FormCard>

      <FormCard label="NOTES">
        <FormField label="Delivery Notes" value={notes} onChangeText={setNotes} multiline numberOfLines={2}
          style={{ minHeight: 70, textAlignVertical: "top" } as any}
          placeholder="Optional delivery instructions…" />
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

  sectionHeader: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  sectionHeaderLeft: { flex: 1, flexDirection: "row", alignItems: "center", gap: spacing.sm },
  sectionTitle: { fontSize: font.size.xs, fontWeight: font.weight.bold, color: colors.inkLight, letterSpacing: 1 },
  sectionLine: { flex: 1, height: 1, backgroundColor: colors.border },
  lineCountBadge: {
    minWidth: 22, height: 22, borderRadius: 11,
    backgroundColor: colors.brand + "20", alignItems: "center", justifyContent: "center", paddingHorizontal: 6,
  },
  lineCountText: { fontSize: font.size.xs, fontWeight: font.weight.bold, color: colors.brand },

  lineErrorBanner: {
    backgroundColor: colors.errorBg,
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: "#fca5a5",
  },
  lineErrorText: { fontSize: font.size.sm, color: colors.error, fontWeight: font.weight.medium },

  lineCard: {
    backgroundColor: colors.bg,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.md,
  },
  lineCardHeader: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  lineNum: {
    backgroundColor: colors.brandLight,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.brandMid,
  },
  lineNumText: { fontSize: font.size.xs, fontWeight: font.weight.bold, color: colors.brand },
  lineProductPreview: { flex: 1, fontSize: font.size.xs, color: colors.inkMid, fontStyle: "italic" },
  removeBtn: {
    paddingHorizontal: spacing.sm, paddingVertical: 3,
    backgroundColor: "#fef2f2", borderRadius: radius.full,
    borderWidth: 1, borderColor: "#fca5a5",
  },
  removeBtnText: { fontSize: font.size.xs, color: "#dc2626", fontWeight: font.weight.semibold },

  row: { flexDirection: "row", gap: spacing.md },
  half: { flex: 1 },
  lineSubtotal: {
    textAlign: "right",
    fontSize: font.size.sm,
    color: colors.brand,
    fontWeight: font.weight.semibold,
  },

  addLineBtn: {
    borderWidth: 1.5,
    borderColor: colors.brand,
    borderStyle: "dashed",
    borderRadius: radius.lg,
    paddingVertical: spacing.md,
    alignItems: "center",
  },
  addLineBtnText: { color: colors.brand, fontWeight: font.weight.bold, fontSize: font.size.sm },

  totalCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: colors.brandLight,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.brandMid,
    padding: spacing.lg,
    ...shadow.sm,
  },
  totalLeft: { gap: 2 },
  totalLabel: { fontSize: font.size.md, fontWeight: font.weight.bold, color: colors.brandDark },
  totalLineCount: { fontSize: font.size.xs, color: colors.brand },
  totalValue: { fontSize: font.size.xxl, fontWeight: font.weight.extrabold, color: colors.brand },
});
