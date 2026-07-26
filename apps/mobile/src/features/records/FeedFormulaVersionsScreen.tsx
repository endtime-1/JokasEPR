import { useCallback, useEffect, useState } from "react";
import { Alert, FlatList, RefreshControl, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRoute } from "@react-navigation/native";
import { EmptyState } from "../../components/EmptyState";
import { Icon } from "../../components/Icon";
import { PageHeader } from "../../components/PageHeader";
import { SkeletonList } from "../../components/SkeletonLoader";
import { useToast } from "../../components/Toast";
import { fetchFeedFormulaVersions, createFeedFormulaVersion, type FeedFormulaVersion } from "../../api/endpoints";
import { useAuth } from "../../auth/AuthContext";
import type { RecordsScreenProps } from "../../navigation/types";
import { colors, font, radius, shadow, spacing } from "../../constants/theme";

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-GH", { day: "2-digit", month: "short", year: "numeric" });
}

export function FeedFormulaVersionsScreen() {
  const route   = useRoute<RecordsScreenProps<"FeedFormulaVersions">["route"]>();
  const toast   = useToast();
  const { user } = useAuth();
  const { formulaId, formulaName } = route.params;

  const canManage = user?.permissions?.includes("feed.manage") ?? false;

  const [versions,    setVersions]    = useState<FeedFormulaVersion[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [refreshing,  setRefreshing]  = useState(false);
  const [snapshotting, setSnapshotting] = useState(false);

  const load = useCallback(async (isRefresh = false) => {
    if (!isRefresh) setLoading(true);
    else setRefreshing(true);
    try {
      const res = await fetchFeedFormulaVersions(formulaId);
      setVersions((res.data as any) ?? []);
    } catch {
      toast.show({ type: "error", message: "Could not load versions." });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [formulaId]);

  useEffect(() => { load(); }, [load]);

  function handleSnapshot() {
    Alert.alert(
      "Create Version Snapshot",
      `Save a snapshot of the current "${formulaName}" formula? This records the current ingredient composition as a versioned history entry.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Create Snapshot",
          onPress: async () => {
            setSnapshotting(true);
            try {
              await createFeedFormulaVersion(formulaId, {});
              toast.show({ type: "success", message: "Snapshot created." });
              load(true);
            } catch {
              toast.show({ type: "error", message: "Failed to create snapshot." });
            } finally {
              setSnapshotting(false);
            }
          },
        },
      ]
    );
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.safe} edges={["bottom"]}>
        <View style={styles.pad}><SkeletonList count={4} /></View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={["bottom"]}>
      <FlatList
        data={versions}
        keyExtractor={(v) => v.id}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={colors.brand} />}
        ItemSeparatorComponent={() => <View style={{ height: spacing.sm }} />}
        ListHeaderComponent={
          <View style={styles.header}>
            <PageHeader icon="history" iconColor="#2563eb" title="Version History" subtitle={formulaName} />
            {canManage && (
              <TouchableOpacity style={styles.snapshotBtn} onPress={handleSnapshot} disabled={snapshotting} activeOpacity={0.8}>
                <Icon name="camera" size={16} color={colors.white} />
                <Text style={styles.snapshotBtnText}>{snapshotting ? "Creating…" : "Snapshot"}</Text>
              </TouchableOpacity>
            )}
          </View>
        }
        ListEmptyComponent={
          <EmptyState icon="history" title="No version history" subtitle="Snapshots of this formula will appear here after they are created." iconColor="#2563eb" />
        }
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View style={styles.versionBadge}>
              <Text style={styles.versionNum}>v{item.version}</Text>
            </View>
            <View style={styles.cardText}>
              {item.notes ? (
                <Text style={styles.notes}>{item.notes}</Text>
              ) : (
                <Text style={styles.noNotes}>No notes</Text>
              )}
              {item.createdBy?.fullName ? (
                <Text style={styles.author}>By {item.createdBy.fullName}</Text>
              ) : null}
              <Text style={styles.date}>{fmtDate(item.createdAt)}</Text>
            </View>
          </View>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:           { flex: 1, backgroundColor: colors.bg },
  list:           { padding: spacing.xl, paddingBottom: spacing.xxxl },
  pad:            { padding: spacing.xl },
  header:         { gap: spacing.md, marginBottom: spacing.md },

  snapshotBtn:    { flexDirection: "row", alignItems: "center", gap: spacing.sm, backgroundColor: "#2563eb", paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderRadius: radius.lg, alignSelf: "flex-start" },
  snapshotBtnText:{ fontSize: font.size.sm, fontFamily: font.family.bold, color: colors.white },

  card:        { flexDirection: "row", alignItems: "center", backgroundColor: colors.bgCard, borderRadius: radius.xl, borderWidth: 1, borderColor: colors.border, padding: spacing.lg, gap: spacing.md, ...shadow.sm },
  versionBadge:{ width: 44, height: 44, borderRadius: radius.md, backgroundColor: "#eff6ff", borderWidth: 1, borderColor: "#bfdbfe", alignItems: "center", justifyContent: "center" },
  versionNum:  { fontSize: font.size.sm, fontFamily: font.family.extrabold, color: "#2563eb" },
  cardText:    { flex: 1, gap: 3 },
  notes:       { fontSize: font.size.sm, fontFamily: font.family.medium, color: colors.ink },
  noNotes:     { fontSize: font.size.sm, fontFamily: font.family.regular, color: colors.inkLight, fontStyle: "italic" },
  author:      { fontSize: font.size.xs, color: colors.inkMid, fontFamily: font.family.regular },
  date:        { fontSize: font.size.xs, color: colors.inkLight, fontFamily: font.family.regular },
});
