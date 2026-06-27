import { useCallback, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { useAuth } from "../auth/AuthContext";
import { SyncBanner } from "../components/SyncBanner";
import { colors, font, radius, shadow, spacing } from "../constants/theme";
import { fetchMyDuties, type DutyItem } from "../api/endpoints";

type Action = { id: string; icon: string; label: string; screen: string; roles: string[]; color: string; featured?: boolean };

const ALL_ACTIONS: Action[] = [
  { id: "daily",       icon: "📋", label: "Daily Record",    screen: "DailyPoultry",     roles: ["WORKER","OFFICER","MANAGER","CEO","SUPER_ADMIN"], color: "#4ade80", featured: true  },
  { id: "eggs",        icon: "🥚", label: "Egg Collection",  screen: "EggCollection",    roles: ["WORKER","OFFICER","MANAGER","CEO","SUPER_ADMIN"], color: "#fbbf24", featured: true  },
  { id: "feed",        icon: "🌾", label: "Feed Record",     screen: "FeedConsumption",  roles: ["WORKER","OFFICER","MANAGER","CEO","SUPER_ADMIN"], color: "#86efac", featured: true  },
  { id: "mortality",   icon: "📉", label: "Mortality",       screen: "Mortality",        roles: ["WORKER","OFFICER","MANAGER","CEO","SUPER_ADMIN"], color: "#f87171", featured: true  },
  { id: "hipro",       icon: "🧮", label: "Feed Predict",    screen: "HiproPredict",     roles: ["OFFICER","MANAGER","CEO","SUPER_ADMIN"],          color: "#f58220" },
  { id: "medication",  icon: "💊", label: "Medication",      screen: "Medication",       roles: ["WORKER","OFFICER","MANAGER","CEO","SUPER_ADMIN"], color: "#a78bfa" },
  { id: "vaccination", icon: "💉", label: "Vaccination",     screen: "Vaccination",      roles: ["WORKER","OFFICER","MANAGER","CEO","SUPER_ADMIN"], color: "#67e8f9" },
  { id: "stock",       icon: "📦", label: "Stock",           screen: "StockMovement",    roles: ["OFFICER","MANAGER","CEO","SUPER_ADMIN"],          color: "#fb923c" },
  { id: "sales",       icon: "🧾", label: "Sales Order",     screen: "SalesOrder",       roles: ["OFFICER","MANAGER","CEO","SUPER_ADMIN"],          color: "#34d399" },
  { id: "production",  icon: "🏭", label: "Production",      screen: "ProductionRecord", roles: ["WORKER","OFFICER","MANAGER","CEO","SUPER_ADMIN"], color: "#60a5fa" },
  { id: "soya",        icon: "🫘", label: "Soya Processing", screen: "SoyaProcessing",    roles: ["OFFICER","MANAGER","CEO","SUPER_ADMIN"],          color: "#f59e0b" },
  { id: "prospect",    icon: "📍", label: "Log Visit",        screen: "ProspectVisit",     roles: ["WORKER","OFFICER","MANAGER","CEO","SUPER_ADMIN"], color: "#fbbf24", featured: true },
  { id: "quality",     icon: "🔬", label: "Quality Check",   screen: "QualityCheck",      roles: ["OFFICER","MANAGER","CEO","SUPER_ADMIN"],          color: "#818cf8" },
  { id: "attendance",  icon: "🗓️", label: "Check-In",        screen: "AttendanceCheckIn", roles: ["WORKER","OFFICER","MANAGER","CEO","SUPER_ADMIN"], color: "#60a5fa" },
  { id: "scanner",     icon: "📷", label: "QR Scanner",      screen: "Scanner",           roles: ["WORKER","OFFICER","MANAGER","CEO","SUPER_ADMIN"], color: "#c084fc" },
  { id: "dashboard",   icon: "📊", label: "Dashboard",       screen: "Dashboard",        roles: ["MANAGER","CEO","SUPER_ADMIN"],                    color: "#f58220" },
  { id: "tasks",       icon: "✅", label: "My Tasks",        screen: "TaskList",         roles: ["WORKER","OFFICER","MANAGER","CEO","SUPER_ADMIN"], color: "#2dd4bf" },
];

const ROLE_LABELS: Record<string, string> = {
  SUPER_ADMIN: "Super Admin", CEO: "CEO", MANAGER: "Manager", OFFICER: "Field Officer", WORKER: "Farm Worker", AUDITOR: "Auditor",
};

const SLOT_LABEL: Record<string, { label: string; color: string; bg: string }> = {
  MORNING: { label: "Morning",  color: "#d97706", bg: "#fef3c7" },
  EVENING: { label: "Evening",  color: "#7c3aed", bg: "#ede9fe" },
  ANYTIME: { label: "Anytime",  color: "#0369a1", bg: "#e0f2fe" },
};

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

function formatDay() {
  return new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}

export function HomeScreen() {
  const { user } = useAuth();
  const navigation = useNavigation<any>();

  const userRoles = user?.roles ?? [];
  const topRole = userRoles[0] ?? "WORKER";
  const firstName = user?.fullName?.split(" ")[0] ?? "User";
  const farmCount = user?.farmIds?.length ?? 0;

  const permitted = ALL_ACTIONS.filter((a) => a.roles.some((r) => userRoles.includes(r)));
  const featured = permitted.filter((a) => a.featured);
  const secondary = permitted.filter((a) => !a.featured);

  // ── My Day duties ──────────────────────────────────────────────────────────
  const [duties, setDuties] = useState<DutyItem[]>([]);
  const [dutySummary, setDutySummary] = useState<{ total: number; done: number; pending: number } | null>(null);
  const [dutiesLoading, setDutiesLoading] = useState(true);
  const [dutiesError, setDutiesError] = useState(false);

  async function loadDuties() {
    setDutiesLoading(true);
    setDutiesError(false);
    try {
      const res = await fetchMyDuties();
      setDuties(res.data.duties);
      setDutySummary(res.data.summary);
    } catch {
      setDutiesError(true);
    } finally {
      setDutiesLoading(false);
    }
  }

  useFocusEffect(
    useCallback(() => {
      void loadDuties();
    }, [])
  );

  function navigate(screen: string) {
    if (screen === "Dashboard") navigation.navigate("MoreTab", { screen });
    else if (screen === "TaskList") navigation.navigate("TasksTab", { screen });
    else navigation.navigate("RecordsTab", { screen });
  }

  const allDone = dutySummary ? dutySummary.pending === 0 && dutySummary.total > 0 : false;

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <SyncBanner />
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

        {/* ── Hero ── */}
        <View style={styles.hero}>
          <View style={[styles.deco, styles.decoTL]} />
          <View style={[styles.deco, styles.decoBR]} />
          <View style={[styles.deco, styles.decoMid]} />

          <View style={styles.heroLeft}>
            <Text style={styles.greeting}>{getGreeting()},</Text>
            <Text style={styles.heroName}>{firstName} 👋</Text>
            <View style={styles.rolePill}>
              <Text style={styles.roleText}>{ROLE_LABELS[topRole] ?? topRole}</Text>
            </View>
          </View>

          <View style={styles.avatarRing}>
            <View style={styles.avatarInner}>
              <Text style={styles.avatarEmoji}>🐔</Text>
            </View>
          </View>
        </View>

        {/* ── Date badge ── */}
        <View style={styles.stripRow}>
          <View style={styles.dateBadge}>
            <Text style={styles.dateBadgeText}>📅  {formatDay()}</Text>
          </View>
        </View>

        {/* ── Stat chips ── */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.statStrip}>
          <StatChip icon="🏡" label="Farms"      value={farmCount > 0 ? String(farmCount) : "—"}   color={colors.brand} />
          <StatChip icon="📋" label="Operations" value={String(permitted.length)}                   color="#4ade80" />
          <StatChip icon="🔐" label="Role"       value={ROLE_LABELS[topRole] ?? topRole}            color="#a78bfa" />
          {dutySummary && (
            <StatChip
              icon={allDone ? "✅" : "⏳"}
              label="Today"
              value={allDone ? "All done" : `${dutySummary.done}/${dutySummary.total}`}
              color={allDone ? "#22c55e" : "#f59e0b"}
            />
          )}
        </ScrollView>

        {/* ── My Day checklist ── */}
        <View style={styles.section}>
          <SectionLabel title="MY DAY" />

          {dutiesLoading ? (
            <View style={styles.dutyLoadingBox}>
              <ActivityIndicator size="small" color={colors.brand} />
              <Text style={styles.dutyLoadingText}>Loading your duties...</Text>
            </View>
          ) : dutiesError ? (
            <TouchableOpacity style={styles.dutyErrorBox} onPress={loadDuties} activeOpacity={0.75}>
              <Text style={styles.dutyErrorText}>Could not load duties. Tap to retry.</Text>
            </TouchableOpacity>
          ) : duties.length === 0 ? (
            <View style={styles.dutyEmptyBox}>
              <Text style={styles.dutyEmptyEmoji}>🎉</Text>
              <Text style={styles.dutyEmptyText}>No duties assigned for your role today.</Text>
            </View>
          ) : (
            <>
              {allDone ? (
                <View style={styles.dutyAllDoneBanner}>
                  <Text style={styles.dutyAllDoneEmoji}>🎉</Text>
                  <Text style={styles.dutyAllDoneText}>All duties recorded for today — great work!</Text>
                </View>
              ) : (
                <View style={styles.dutyProgressBar}>
                  <View style={[styles.dutyProgressFill, { width: `${Math.round(((dutySummary?.done ?? 0) / (dutySummary?.total ?? 1)) * 100)}%` }]} />
                  <Text style={styles.dutyProgressLabel}>
                    {dutySummary?.done ?? 0} of {dutySummary?.total ?? 0} completed
                  </Text>
                </View>
              )}

              <View style={styles.dutyList}>
                {duties.map((d) => {
                  const slot = SLOT_LABEL[d.slot] ?? SLOT_LABEL.ANYTIME;
                  return (
                    <TouchableOpacity
                      key={d.id}
                      style={[styles.dutyRow, d.doneToday && styles.dutyRowDone]}
                      onPress={() => navigate(d.screen)}
                      activeOpacity={0.75}
                    >
                      <View style={[styles.dutyIconBox, d.doneToday ? styles.dutyIconDone : styles.dutyIconPending]}>
                        <Text style={styles.dutyIcon}>{d.icon}</Text>
                      </View>

                      <View style={styles.dutyBody}>
                        <Text style={[styles.dutyTitle, d.doneToday && styles.dutyTitleDone]}>{d.title}</Text>
                        <Text style={styles.dutyDesc} numberOfLines={1}>{d.description}</Text>
                        <View style={styles.dutyMeta}>
                          <View style={[styles.dutySlotPill, { backgroundColor: slot.bg }]}>
                            <Text style={[styles.dutySlotText, { color: slot.color }]}>{slot.label}</Text>
                          </View>
                          {d.count > 0 && (
                            <Text style={styles.dutyCountText}>{d.count} record{d.count !== 1 ? "s" : ""} today</Text>
                          )}
                        </View>
                      </View>

                      <View style={[styles.dutyStatus, d.doneToday ? styles.dutyStatusDone : styles.dutyStatusPending]}>
                        <Text style={styles.dutyStatusIcon}>{d.doneToday ? "✓" : "!"}</Text>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </>
          )}
        </View>

        {/* ── Featured quick actions (2×2 large tiles) ── */}
        {featured.length > 0 && (
          <View style={styles.section}>
            <SectionLabel title="QUICK ACTIONS" />
            <View style={styles.featuredGrid}>
              {featured.map((a) => (
                <TouchableOpacity key={a.id} style={styles.featuredTile} onPress={() => navigate(a.screen)} activeOpacity={0.75}>
                  <View style={[styles.featuredIconBg, { backgroundColor: a.color + "28" }]}>
                    <Text style={styles.featuredEmoji}>{a.icon}</Text>
                  </View>
                  <Text style={styles.featuredLabel}>{a.label}</Text>
                  <View style={[styles.featuredAccent, { backgroundColor: a.color }]} />
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {/* ── Secondary operations (3-col grid) ── */}
        {secondary.length > 0 && (
          <View style={styles.section}>
            <SectionLabel title="MORE OPERATIONS" />
            <View style={styles.secondaryGrid}>
              {secondary.map((a) => (
                <TouchableOpacity key={a.id} style={styles.secondaryTile} onPress={() => navigate(a.screen)} activeOpacity={0.75}>
                  <View style={[styles.secondaryIconBg, { backgroundColor: a.color + "22" }]}>
                    <Text style={styles.secondaryEmoji}>{a.icon}</Text>
                  </View>
                  <Text style={styles.secondaryLabel}>{a.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {/* ── Farm context card ── */}
        {farmCount > 0 && (
          <View style={styles.farmCard}>
            <View style={styles.farmCardHeader}>
              <View style={styles.farmCardIcon}>
                <Text style={styles.farmCardEmoji}>🏡</Text>
              </View>
              <View style={styles.farmCardText}>
                <Text style={styles.farmCardTitle}>Farm Assignment</Text>
                <Text style={styles.farmCardSub}>You are active on {farmCount} farm{farmCount !== 1 ? "s" : ""}</Text>
              </View>
              <View style={styles.farmActiveBadge}>
                <View style={styles.farmActiveDot} />
                <Text style={styles.farmActiveBadgeText}>Active</Text>
              </View>
            </View>

            <View style={styles.farmCardDivider} />

            <View style={styles.farmCardFooter}>
              <View style={styles.farmMetric}>
                <Text style={styles.farmMetricValue}>{farmCount}</Text>
                <Text style={styles.farmMetricLabel}>Farms</Text>
              </View>
              <View style={styles.farmMetricSep} />
              <View style={styles.farmMetric}>
                <Text style={styles.farmMetricValue}>{permitted.length}</Text>
                <Text style={styles.farmMetricLabel}>Modules</Text>
              </View>
              <View style={styles.farmMetricSep} />
              <View style={styles.farmMetric}>
                <Text style={styles.farmMetricValue}>{ROLE_LABELS[topRole]?.split(" ")[0] ?? topRole}</Text>
                <Text style={styles.farmMetricLabel}>Access</Text>
              </View>
            </View>
          </View>
        )}

        {/* ── Footer ── */}
        <View style={styles.homeFooter}>
          <Text style={styles.homeFooterText}>AKOKO SOLUTIONS ERP · v1.0.0</Text>
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────

function SectionLabel({ title }: { title: string }) {
  return (
    <View style={styles.sectionLabelRow}>
      <Text style={styles.sectionLabelText}>{title}</Text>
      <View style={styles.sectionLabelLine} />
    </View>
  );
}

function StatChip({ icon, label, value, color }: { icon: string; label: string; value: string; color: string }) {
  return (
    <View style={styles.statChip}>
      <View style={[styles.statChipIcon, { backgroundColor: color + "20" }]}>
        <Text style={styles.statChipEmoji}>{icon}</Text>
      </View>
      <View style={styles.statChipText}>
        <Text style={[styles.statChipValue, { color }]}>{value}</Text>
        <Text style={styles.statChipLabel}>{label}</Text>
      </View>
    </View>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.brand },
  scroll: { backgroundColor: colors.bg, paddingBottom: spacing.xxxl },

  // hero
  hero: {
    backgroundColor: colors.brand,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xl,
    paddingBottom: 60,
    overflow: "hidden",
  },
  deco: { position: "absolute", borderRadius: radius.full, backgroundColor: "rgba(255,255,255,0.08)" },
  decoTL: { width: 220, height: 220, top: -80, left: -60 },
  decoBR: { width: 140, height: 140, bottom: -50, right: -20 },
  decoMid: { width: 80, height: 80, top: 10, right: 90 },

  heroLeft: { gap: 6 },
  greeting: { fontSize: font.size.sm, color: "rgba(255,255,255,0.8)", fontWeight: font.weight.medium },
  heroName: { fontSize: font.size.xxl, fontWeight: font.weight.extrabold, color: colors.white },
  rolePill: {
    alignSelf: "flex-start",
    backgroundColor: "rgba(255,255,255,0.2)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.25)",
    paddingHorizontal: spacing.md,
    paddingVertical: 4,
    borderRadius: radius.full,
  },
  roleText: { fontSize: font.size.xs, color: colors.white, fontWeight: font.weight.bold, letterSpacing: 0.3 },

  avatarRing: {
    width: 74, height: 74, borderRadius: 37,
    backgroundColor: "rgba(255,255,255,0.18)",
    alignItems: "center", justifyContent: "center",
    borderWidth: 2, borderColor: "rgba(255,255,255,0.3)",
  },
  avatarInner: {
    width: 58, height: 58, borderRadius: 29,
    backgroundColor: "rgba(255,255,255,0.22)",
    alignItems: "center", justifyContent: "center",
  },
  avatarEmoji: { fontSize: 30 },

  // date + stat strip
  stripRow: {
    backgroundColor: colors.bgCard,
    borderRadius: radius.lg,
    marginHorizontal: spacing.xl,
    marginTop: -28,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    ...shadow.md,
  },
  dateBadge: { flexDirection: "row", alignItems: "center" },
  dateBadgeText: { fontSize: font.size.xs, color: colors.inkMid, fontWeight: font.weight.semibold },

  statStrip: { paddingHorizontal: spacing.xl, paddingVertical: spacing.lg, gap: spacing.sm },
  statChip: {
    flexDirection: "row", alignItems: "center", gap: spacing.sm,
    backgroundColor: colors.bgCard, borderRadius: radius.lg,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    borderWidth: 1, borderColor: colors.border, ...shadow.sm,
  },
  statChipIcon: { width: 36, height: 36, borderRadius: radius.md, alignItems: "center", justifyContent: "center" },
  statChipEmoji: { fontSize: 18 },
  statChipText: { gap: 1 },
  statChipValue: { fontSize: font.size.md, fontWeight: font.weight.bold },
  statChipLabel: { fontSize: font.size.xs, color: colors.inkLight, fontWeight: font.weight.medium },

  // sections
  section: { paddingHorizontal: spacing.xl, gap: spacing.md, marginTop: spacing.xs },
  sectionLabelRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  sectionLabelText: { fontSize: font.size.xs, fontWeight: font.weight.bold, color: colors.inkLight, letterSpacing: 1.2 },
  sectionLabelLine: { flex: 1, height: 1, backgroundColor: colors.border },

  // duty checklist
  dutyLoadingBox: { flexDirection: "row", alignItems: "center", gap: spacing.md, padding: spacing.lg, backgroundColor: colors.bgCard, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border },
  dutyLoadingText: { fontSize: font.size.sm, color: colors.inkLight },

  dutyErrorBox: { padding: spacing.lg, backgroundColor: "#fef2f2", borderRadius: radius.lg, borderWidth: 1, borderColor: "#fca5a5", alignItems: "center" },
  dutyErrorText: { fontSize: font.size.sm, color: "#dc2626", fontWeight: font.weight.medium },

  dutyEmptyBox: { padding: spacing.xl, backgroundColor: colors.bgCard, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, alignItems: "center", gap: spacing.sm },
  dutyEmptyEmoji: { fontSize: 32 },
  dutyEmptyText: { fontSize: font.size.sm, color: colors.inkLight, textAlign: "center" },

  dutyAllDoneBanner: {
    flexDirection: "row", alignItems: "center", gap: spacing.md,
    backgroundColor: "#f0fdf4", borderRadius: radius.lg,
    borderWidth: 1, borderColor: "#86efac",
    padding: spacing.lg,
  },
  dutyAllDoneEmoji: { fontSize: 24 },
  dutyAllDoneText: { fontSize: font.size.sm, color: "#15803d", fontWeight: font.weight.semibold, flex: 1 },

  dutyProgressBar: {
    height: 32, backgroundColor: colors.bgCard,
    borderRadius: radius.full, borderWidth: 1, borderColor: colors.border,
    overflow: "hidden", justifyContent: "center",
  },
  dutyProgressFill: { position: "absolute", left: 0, top: 0, bottom: 0, backgroundColor: colors.brand + "30", borderRadius: radius.full },
  dutyProgressLabel: { fontSize: font.size.xs, color: colors.inkMid, fontWeight: font.weight.semibold, textAlign: "center" },

  dutyList: { gap: spacing.sm },

  dutyRow: {
    flexDirection: "row", alignItems: "center", gap: spacing.md,
    backgroundColor: colors.bgCard, borderRadius: radius.xl,
    borderWidth: 1, borderColor: colors.border,
    padding: spacing.md, ...shadow.sm,
  },
  dutyRowDone: { borderColor: "#86efac", backgroundColor: "#f0fdf4" },

  dutyIconBox: { width: 50, height: 50, borderRadius: radius.lg, alignItems: "center", justifyContent: "center" },
  dutyIconPending: { backgroundColor: "#fef9c3" },
  dutyIconDone: { backgroundColor: "#dcfce7" },
  dutyIcon: { fontSize: 24 },

  dutyBody: { flex: 1, gap: 3 },
  dutyTitle: { fontSize: font.size.md, fontWeight: font.weight.bold, color: colors.ink },
  dutyTitleDone: { color: "#15803d" },
  dutyDesc: { fontSize: font.size.xs, color: colors.inkLight },
  dutyMeta: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginTop: 2 },
  dutySlotPill: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: radius.full },
  dutySlotText: { fontSize: 10, fontWeight: font.weight.bold },
  dutyCountText: { fontSize: 10, color: colors.inkLight },

  dutyStatus: { width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  dutyStatusDone: { backgroundColor: "#22c55e" },
  dutyStatusPending: { backgroundColor: "#f59e0b" },
  dutyStatusIcon: { color: colors.white, fontSize: 14, fontWeight: font.weight.bold },

  // featured 2×2
  featuredGrid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md },
  featuredTile: {
    width: "47.5%", backgroundColor: colors.bgCard,
    borderRadius: radius.xl, borderWidth: 1, borderColor: colors.border,
    padding: spacing.lg, gap: spacing.md, overflow: "hidden", ...shadow.md,
  },
  featuredIconBg: { width: 56, height: 56, borderRadius: radius.lg, alignItems: "center", justifyContent: "center" },
  featuredEmoji: { fontSize: 28 },
  featuredLabel: { fontSize: font.size.md, fontWeight: font.weight.bold, color: colors.ink },
  featuredAccent: { position: "absolute", bottom: 0, left: 0, right: 0, height: 3, borderBottomLeftRadius: radius.xl, borderBottomRightRadius: radius.xl },

  // secondary 3-col
  secondaryGrid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md },
  secondaryTile: {
    width: "30%", backgroundColor: colors.bgCard,
    borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border,
    alignItems: "center", justifyContent: "center",
    padding: spacing.md, paddingBottom: spacing.lg, gap: spacing.sm,
    aspectRatio: 0.9, ...shadow.sm,
  },
  secondaryIconBg: { width: 48, height: 48, borderRadius: radius.md, alignItems: "center", justifyContent: "center" },
  secondaryEmoji: { fontSize: 24 },
  secondaryLabel: { fontSize: font.size.xs, fontWeight: font.weight.semibold, color: colors.ink, textAlign: "center" },

  // farm card
  farmCard: {
    marginHorizontal: spacing.xl, marginTop: spacing.xl,
    backgroundColor: colors.bgCard, borderRadius: radius.xl,
    borderWidth: 1, borderColor: colors.brandMid, overflow: "hidden", ...shadow.md,
  },
  farmCardHeader: {
    flexDirection: "row", alignItems: "center", gap: spacing.md,
    padding: spacing.lg, backgroundColor: colors.brandLight,
  },
  farmCardIcon: { width: 48, height: 48, borderRadius: radius.md, backgroundColor: colors.brandMid, alignItems: "center", justifyContent: "center" },
  farmCardEmoji: { fontSize: 24 },
  farmCardText: { flex: 1, gap: 2 },
  farmCardTitle: { fontSize: font.size.md, fontWeight: font.weight.bold, color: colors.brandDark },
  farmCardSub: { fontSize: font.size.xs, color: colors.brand, fontWeight: font.weight.medium },
  farmActiveBadge: {
    flexDirection: "row", alignItems: "center", gap: 5,
    backgroundColor: "#f0fdf4", paddingHorizontal: spacing.md, paddingVertical: 5,
    borderRadius: radius.full, borderWidth: 1, borderColor: "#86efac",
  },
  farmActiveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: "#22c55e" },
  farmActiveBadgeText: { fontSize: font.size.xs, color: colors.success, fontWeight: font.weight.bold },
  farmCardDivider: { height: 1, backgroundColor: colors.border },
  farmCardFooter: { flexDirection: "row", padding: spacing.lg, backgroundColor: colors.bgCard },
  farmMetric: { flex: 1, alignItems: "center", gap: 3 },
  farmMetricValue: { fontSize: font.size.lg, fontWeight: font.weight.extrabold, color: colors.ink },
  farmMetricLabel: { fontSize: font.size.xs, color: colors.inkLight, fontWeight: font.weight.medium },
  farmMetricSep: { width: 1, backgroundColor: colors.border, marginVertical: 4 },

  homeFooter: { marginTop: spacing.xxl, alignItems: "center", paddingBottom: spacing.lg },
  homeFooterText: { fontSize: font.size.xs, color: colors.inkLight, fontWeight: font.weight.medium, letterSpacing: 0.5 },
});
