import { useCallback, useEffect, useState } from "react";
import { FlatList, RefreshControl, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { Badge } from "../../components/Badge";
import { EmptyState } from "../../components/EmptyState";
import { Icon } from "../../components/Icon";
import { PageHeader } from "../../components/PageHeader";
import { SegmentedControl } from "../../components/SegmentedControl";
import { SkeletonList } from "../../components/SkeletonLoader";
import { fetchPurchaseRequests, type PurchaseRequest } from "../../api/endpoints";
import { colors, font, radius, semantic, shadow, spacing } from "../../constants/theme";

const GHS = (n: number) =>
  `GHS ${Number(n).toLocaleString("en-GH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const STATUS_META: Record<string, { color: string; bg: string; border: string; label: string }> = {
  PENDING:          { ...semantic.status.pending,    label: "Pending"  },
  PENDING_APPROVAL: { ...semantic.status.pending,    label: "Pending Approval" },
  APPROVED:         { ...semantic.status.approved,   label: "Approved" },
  REJECTED:         { ...semantic.status.rejected,   label: "Rejected" },
  DRAFT:            { ...semantic.status.draft,      label: "Draft"    },
  CONVERTED:        { ...semantic.status.approved,   label: "Converted to PO" },
};

const SEGMENTS = [
  { key: "ALL",      label: "All"      },
  { key: "PENDING",  label: "Pending"  },
  { key: "APPROVED", label: "Approved" },
  { key: "REJECTED", label: "Rejected" },
];

export function PurchaseRequestListScreen() {
  const navigation = useNavigation<any>();
  const [allPrs,     setAllPrs]     = useState<PurchaseRequest[]>([]);
  const [tab,        setTab]        = useState("ALL");
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (isRefresh = false) => {
    if (!isRefresh) setLoading(true);
    else setRefreshing(true);
    try {
      const res = await fetchPurchaseRequests();
      setAllPrs((res.data as any) ?? []);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const displayed = tab === "ALL"
    ? allPrs
    : allPrs.filter((p) => p.status === tab || (tab === "PENDING" && p.status === "PENDING_APPROVAL"));

  if (loading) {
    return (
      <SafeAreaView style={styles.safe} edges={["bottom"]}>
        <View style={styles.pad}><SkeletonList count={5} /></View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={["bottom"]}>
      <FlatList
        data={displayed}
        keyExtractor={(p) => p.id}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={colors.brand} />}
        ItemSeparatorComponent={() => <View style={{ height: spacing.sm }} />}
        ListHeaderComponent={
          <View style={styles.header}>
            <PageHeader
              icon="file-document-outline"
              iconColor="#2563eb"
              title="Purchase Requests"
              subtitle={`${allPrs.length} total`}
              right={
                <TouchableOpacity style={styles.newBtn} onPress={() => navigation.navigate("PurchaseRequestCreate")} activeOpacity={0.8}>
                  <Icon name="plus" size={18} color={colors.white} />
                </TouchableOpacity>
              }
            />
            <SegmentedControl segments={SEGMENTS} active={tab} onChange={setTab} />
          </View>
        }
        ListEmptyComponent={
          <EmptyState icon="file-document-outline" title="No purchase requests" subtitle="Tap + to create your first request." iconColor="#2563eb" actionLabel="New Request" onAction={() => navigation.navigate("PurchaseRequestCreate")} />
        }
        renderItem={({ item }) => {
          const s = STATUS_META[item.status] ?? STATUS_META.DRAFT;
          return (
            <View style={styles.card}>
              <View style={styles.cardTop}>
                <View style={styles.cardLeft}>
                  <View style={styles.iconWrap}>
                    <Icon name="file-document-outline" size={20} color="#2563eb" />
                  </View>
                  <View style={styles.cardText}>
                    <Text style={styles.ref}>{item.reference}</Text>
                    {item.supplier ? <Text style={styles.supplier}>{item.supplier.name}</Text> : null}
                    <Text style={styles.date}>{new Date(item.requestDate).toLocaleDateString("en-GH", { day: "numeric", month: "short", year: "numeric" })}</Text>
                  </View>
                </View>
                <View style={styles.cardRight}>
                  <Badge label={s.label} color={s.color} bg={s.bg} border={s.border} />
                  {item.totalAmount != null && <Text style={styles.amount}>{GHS(Number(item.totalAmount))}</Text>}
                </View>
              </View>
              {item.items?.length ? (
                <View style={styles.itemsRow}>
                  <Icon name="format-list-bulleted" size={12} color={colors.inkLight} />
                  <Text style={styles.itemsText}>{item.items.length} line item{item.items.length !== 1 ? "s" : ""}</Text>
                  {item.requestedBy && (
                    <>
                      <Icon name="account-outline" size={12} color={colors.inkLight} />
                      <Text style={styles.itemsText}>{item.requestedBy.fullName}</Text>
                    </>
                  )}
                </View>
              ) : null}
            </View>
          );
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: colors.bg },
  list:   { padding: spacing.xl, paddingBottom: spacing.xxxl },
  pad:    { padding: spacing.xl },
  header: { gap: spacing.md, marginBottom: spacing.md },

  newBtn: { width: 36, height: 36, borderRadius: radius.full, backgroundColor: colors.brand, alignItems: "center", justifyContent: "center" },

  card:     { backgroundColor: colors.bgCard, borderRadius: radius.xl, borderWidth: 1, borderColor: colors.border, padding: spacing.lg, gap: spacing.sm, ...shadow.sm },
  cardTop:  { flexDirection: "row", alignItems: "flex-start", gap: spacing.md },
  cardLeft: { flex: 1, flexDirection: "row", alignItems: "center", gap: spacing.md },
  iconWrap: { width: 44, height: 44, borderRadius: radius.md, backgroundColor: "#eff6ff", alignItems: "center", justifyContent: "center" },
  cardText: { flex: 1, gap: 2 },
  ref:      { fontSize: font.size.md, fontFamily: font.family.semibold, color: colors.ink },
  supplier: { fontSize: font.size.sm, color: colors.inkMid, fontFamily: font.family.regular },
  date:     { fontSize: font.size.xs, color: colors.inkLight, fontFamily: font.family.regular },
  cardRight:{ alignItems: "flex-end", gap: 4 },
  amount:   { fontSize: font.size.sm, fontFamily: font.family.extrabold, color: colors.ink },

  itemsRow:  { flexDirection: "row", alignItems: "center", gap: 5 },
  itemsText: { fontSize: font.size.xs, color: colors.inkLight, fontFamily: font.family.regular },
});
