import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { Icon } from "../../components/Icon";
import { MetricCard } from "../../components/MetricCard";
import { useToast } from "../../components/Toast";
import { fetchStorefrontStats, type StorefrontStats } from "../../api/endpoints";
import { colors, font, radius, shadow, spacing } from "../../constants/theme";

type Stats = StorefrontStats["data"];

export function StorefrontDashboardScreen() {
  const navigation = useNavigation<any>();
  const toast      = useToast();

  const [stats,     setStats]     = useState<Stats | null>(null);
  const [loading,   setLoading]   = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    try {
      const res = await fetchStorefrontStats();
      setStats(res.data);
    } catch {
      toast.show({ type: "error", message: "Could not load storefront stats." });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading && !stats) {
    return (
      <SafeAreaView style={styles.safe} edges={["bottom"]}>
        <View style={styles.center}><ActivityIndicator size="large" color={colors.brand} /></View>
      </SafeAreaView>
    );
  }

  const pendingBadge = stats?.pending ? String(stats.pending) : undefined;

  return (
    <SafeAreaView style={styles.safe} edges={["bottom"]}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={colors.brand} />}
      >
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerIcon}>
            <Icon name="shopping" size={24} color={colors.brand} />
          </View>
          <View style={styles.headerText}>
            <Text style={styles.headerTitle}>Storefront</Text>
            <Text style={styles.headerSub}>Online orders from Akoko Solutions website</Text>
          </View>
        </View>

        {/* KPI grid */}
        <View style={styles.metricsGrid}>
          <MetricCard
            label="Published Products"
            value={String(stats?.published ?? 0)}
            icon="package-variant-closed"
            color="#16a34a"
          />
          <MetricCard
            label="Pending Orders"
            value={String(stats?.pending ?? 0)}
            icon="clock-outline"
            color="#d97706"
          />
          <MetricCard
            label="Confirmed"
            value={String(stats?.confirmed ?? 0)}
            icon="check-circle-outline"
            color="#2563eb"
          />
          <MetricCard
            label="Delivered"
            value={String(stats?.delivered ?? 0)}
            icon="truck-check-outline"
            color="#16a34a"
          />
        </View>

        {/* Total orders summary */}
        <View style={styles.summaryCard}>
          <Icon name="storefront-outline" size={20} color={colors.brand} />
          <View style={styles.summaryText}>
            <Text style={styles.summaryLabel}>Total storefront orders</Text>
            <Text style={styles.summaryValue}>{stats?.total ?? 0} orders placed</Text>
          </View>
        </View>

        {/* Actions */}
        <Text style={styles.sectionTitle}>QUICK ACTIONS</Text>
        <View style={styles.actionsCard}>
          <TouchableOpacity
            style={styles.actionRow}
            onPress={() => navigation.navigate("StorefrontOrders")}
            activeOpacity={0.7}
          >
            <View style={[styles.actionIcon, { backgroundColor: "#fff7ed" }]}>
              <Icon name="format-list-bulleted" size={20} color="#d97706" />
            </View>
            <View style={styles.actionText}>
              <Text style={styles.actionLabel}>Manage Orders</Text>
              <Text style={styles.actionSub}>Confirm, deliver, or cancel customer orders</Text>
            </View>
            {pendingBadge && (
              <View style={styles.badge}><Text style={styles.badgeText}>{pendingBadge}</Text></View>
            )}
            <Icon name="chevron-right" size={20} color={colors.inkLight} />
          </TouchableOpacity>

          <View style={styles.divider} />

          <TouchableOpacity
            style={styles.actionRow}
            onPress={() => navigation.navigate("StorefrontProducts")}
            activeOpacity={0.7}
          >
            <View style={[styles.actionIcon, { backgroundColor: "#f0fdf4" }]}>
              <Icon name="package-variant" size={20} color="#16a34a" />
            </View>
            <View style={styles.actionText}>
              <Text style={styles.actionLabel}>Product Catalog</Text>
              <Text style={styles.actionSub}>Publish or hide products from the storefront</Text>
            </View>
            <Icon name="chevron-right" size={20} color={colors.inkLight} />
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: colors.bg },
  scroll: { padding: spacing.xl, paddingBottom: spacing.xxxl, gap: spacing.md },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },

  header:     { flexDirection: "row", alignItems: "center", gap: spacing.md },
  headerIcon: { width: 52, height: 52, borderRadius: radius.lg, backgroundColor: colors.brandLight, borderWidth: 1, borderColor: colors.brandMid, alignItems: "center", justifyContent: "center", ...shadow.sm },
  headerText: { flex: 1, gap: 2 },
  headerTitle: { fontSize: font.size.xl, fontFamily: font.family.extrabold, color: colors.ink },
  headerSub:   { fontSize: font.size.xs, color: colors.inkLight, fontFamily: font.family.regular },

  metricsGrid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },

  summaryCard: { flexDirection: "row", alignItems: "center", gap: spacing.md, backgroundColor: colors.brandLight, borderRadius: radius.xl, borderWidth: 1, borderColor: colors.brandMid, padding: spacing.lg },
  summaryText:  { flex: 1, gap: 2 },
  summaryLabel: { fontSize: font.size.xs, fontFamily: font.family.semibold, color: colors.brand },
  summaryValue: { fontSize: font.size.md, fontFamily: font.family.extrabold, color: colors.ink },

  sectionTitle: { fontSize: font.size.xs, fontFamily: font.family.bold, color: colors.inkLight, textTransform: "uppercase", letterSpacing: 1.2 },

  actionsCard: { backgroundColor: colors.bgCard, borderRadius: radius.xl, borderWidth: 1, borderColor: colors.border, overflow: "hidden", ...shadow.sm },
  actionRow:   { flexDirection: "row", alignItems: "center", padding: spacing.lg, gap: spacing.md },
  actionIcon:  { width: 44, height: 44, borderRadius: radius.md, alignItems: "center", justifyContent: "center" },
  actionText:  { flex: 1, gap: 2 },
  actionLabel: { fontSize: font.size.md - 1, fontFamily: font.family.bold, color: colors.ink },
  actionSub:   { fontSize: font.size.xs, color: colors.inkLight, fontFamily: font.family.regular },
  divider:     { height: 1, backgroundColor: colors.border, marginLeft: spacing.xl + 44 + spacing.md },
  badge:       { backgroundColor: colors.brand, borderRadius: radius.full, paddingHorizontal: spacing.md, paddingVertical: 3, minWidth: 22, alignItems: "center" },
  badgeText:   { color: colors.white, fontSize: 11, fontFamily: font.family.bold },
});
