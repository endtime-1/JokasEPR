import { useCallback, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useAuth } from "../auth/AuthContext";
import { SyncBanner } from "../components/SyncBanner";
import { Icon, type IconName } from "../components/Icon";
import { colors, font, radius, shadow, spacing, semantic } from "../constants/theme";
import { fetchMyDuties, type DutyItem } from "../api/endpoints";

type Action = {
  id: string;
  icon: IconName;
  label: string;
  screen: string;
  roles: string[];
  color: string;
  featured?: boolean;
};

const ALL_ACTIONS: Action[] = [
  { id: "daily",       icon: "clipboard-list",           label: "Daily Record",    screen: "DailyPoultry",     roles: ["WORKER","OFFICER","MANAGER","CEO","SUPER_ADMIN"], color: "#10B981", featured: true  },
  { id: "eggs",        icon: "egg",                      label: "Egg Collection",  screen: "EggCollection",    roles: ["WORKER","OFFICER","MANAGER","CEO","SUPER_ADMIN"], color: "#D97706", featured: true  },
  { id: "feed",        icon: "barley",                   label: "Feed Record",     screen: "FeedConsumption",  roles: ["WORKER","OFFICER","MANAGER","CEO","SUPER_ADMIN"], color: "#10B981", featured: true  },
  { id: "mortality",   icon: "arrow-down-bold",          label: "Mortality",       screen: "Mortality",        roles: ["WORKER","OFFICER","MANAGER","CEO","SUPER_ADMIN"], color: "#EF4444", featured: true  },
  { id: "weight",      icon: "scale",                    label: "Bird Weight",     screen: "BirdWeight",       roles: ["WORKER","OFFICER","MANAGER","CEO","SUPER_ADMIN"], color: "#3B82F6", featured: true  },
  { id: "hipro",       icon: "calculator-variant",       label: "Feed Predict",    screen: "HiproPredict",     roles: ["OFFICER","MANAGER","CEO","SUPER_ADMIN"],          color: colors.brand },
  { id: "medication",  icon: "pill",                     label: "Medication",      screen: "Medication",       roles: ["WORKER","OFFICER","MANAGER","CEO","SUPER_ADMIN"], color: "#8B5CF6" },
  { id: "vaccination", icon: "needle",                   label: "Vaccination",     screen: "Vaccination",      roles: ["WORKER","OFFICER","MANAGER","CEO","SUPER_ADMIN"], color: "#06B6D4" },
  { id: "stock",       icon: "package-variant",          label: "Stock",           screen: "StockMovement",    roles: ["OFFICER","MANAGER","CEO","SUPER_ADMIN"],          color: "#D97706" },
  { id: "sales",       icon: "cart-plus",                label: "Sales Order",     screen: "SalesOrder",       roles: ["OFFICER","MANAGER","CEO","SUPER_ADMIN"],          color: "#10B981" },
  { id: "production",  icon: "factory",                  label: "Production",      screen: "ProductionRecord", roles: ["WORKER","OFFICER","MANAGER","CEO","SUPER_ADMIN"], color: "#3B82F6" },
  { id: "soya",        icon: "seed",                     label: "Soya Processing", screen: "SoyaProcessing",   roles: ["OFFICER","MANAGER","CEO","SUPER_ADMIN"],          color: "#D97706" },
  { id: "prospect",    icon: "map-marker-plus",          label: "Log Visit",       screen: "ProspectVisit",    roles: ["WORKER","OFFICER","MANAGER","CEO","SUPER_ADMIN"], color: "#D97706", featured: true },
  { id: "quality",     icon: "magnify-scan",             label: "Quality Check",   screen: "QualityCheck",     roles: ["OFFICER","MANAGER","CEO","SUPER_ADMIN"],          color: "#8B5CF6" },
  { id: "attendance",  icon: "account-clock",            label: "Check-In",        screen: "AttendanceCheckIn",roles: ["WORKER","OFFICER","MANAGER","CEO","SUPER_ADMIN"], color: "#3B82F6" },
  { id: "scanner",     icon: "qrcode-scan",              label: "QR Scanner",      screen: "Scanner",          roles: ["WORKER","OFFICER","MANAGER","CEO","SUPER_ADMIN"], color: "#8B5CF6" },
  { id: "dashboard",   icon: "chart-areaspline",         label: "Dashboard",       screen: "Dashboard",        roles: ["MANAGER","CEO","SUPER_ADMIN"],                    color: colors.brand },
  { id: "tasks",       icon: "checkbox-marked-circle",   label: "My Tasks",        screen: "TaskList",         roles: ["WORKER","OFFICER","MANAGER","CEO","SUPER_ADMIN"], color: "#0D9488" },
];

const ROLE_LABELS: Record<string, string> = {
  SUPER_ADMIN: "Super Admin", CEO: "CEO", MANAGER: "Manager", OFFICER: "Field Officer", WORKER: "Farm Worker", AUDITOR: "Auditor",
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
  const topRole   = userRoles[0] ?? "WORKER";
  const firstName = user?.fullName?.split(" ")[0] ?? "User";
  const farmCount = user?.farmIds?.length ?? 0;
  const initials  = user?.fullName?.split(" ").map((n) => n[0]).slice(0, 2).join("") ?? "JK";

  const permitted = ALL_ACTIONS.filter((a) => a.roles.some((r) => userRoles.includes(r)));
  const featured  = permitted.filter((a) => a.featured);
  const secondary = permitted.filter((a) => !a.featured);

  const [duties,       setDuties]       = useState<DutyItem[]>([]);
  const [dutySummary,  setDutySummary]  = useState<{ total: number; done: number; pending: number } | null>(null);
  const [dutiesLoading,setDutiesLoading]= useState(true);
  const [dutiesError,  setDutiesError]  = useState(false);

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

  useFocusEffect(useCallback(() => { void loadDuties(); }, []));

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

        {/* ── Welcome Header Panel ── */}
        <View style={styles.hero}>
          {/* Glassmorphic Background Rings */}
          <View style={[styles.deco, styles.decoTopLeft]} />
          <View style={[styles.deco, styles.decoBottomRight]} />

          <View style={styles.heroLeft}>
            <Text style={styles.greeting}>{getGreeting()},</Text>
            <Text style={styles.heroName}>{firstName}</Text>
            <View style={styles.roleBadge}>
              <MaterialCommunityIcons name="shield-check" size={13} color="rgba(255,255,255,0.95)" />
              <Text style={styles.roleText}>{ROLE_LABELS[topRole] ?? topRole}</Text>
            </View>
          </View>

          {/* Glowing Initials Avatar */}
          <View style={styles.avatarGlow}>
            <View style={styles.avatarInner}>
              <Text style={styles.avatarInitials}>{initials}</Text>
            </View>
          </View>
        </View>

        {/* ── Elegant Date Indicator ── */}
        <View style={styles.dateStrip}>
          <MaterialCommunityIcons name="calendar-month-outline" size={16} color={colors.inkMid} />
          <Text style={styles.dateText}>{formatDay()}</Text>
        </View>

        {/* ── Horizontal Telemetry Roll ── */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.telemetryStrip}>
          <TelemetryCard icon="home-group" label="Assigned Farms" value={farmCount > 0 ? String(farmCount) : "—"} color={colors.brand} />
          <TelemetryCard icon="view-dashboard-outline" label="Active Modules" value={String(permitted.length)} color="#10B981" />
          <TelemetryCard icon="account-badge-outline" label="Authorization" value={ROLE_LABELS[topRole]?.split(" ")[0] ?? topRole} color="#8B5CF6" />
          {dutySummary && (
            <TelemetryCard
              icon={allDone ? "check-decagram-outline" : "progress-clock"}
              label="Today's Duties"
              value={allDone ? "All Done" : `${dutySummary.done}/${dutySummary.total}`}
              color={allDone ? "#10B981" : "#D97706"}
            />
          )}
        </ScrollView>

        {/* ── "My Day" Operations Logger ── */}
        <View style={styles.section}>
          <SectionHeader title="My Operations Checklist" />

          {dutiesLoading ? (
            <View style={styles.stateCard}>
              <ActivityIndicator size="small" color={colors.brand} />
              <Text style={styles.stateText}>Retrieving checklist…</Text>
            </View>
          ) : dutiesError ? (
            <TouchableOpacity style={styles.errorCard} onPress={loadDuties} activeOpacity={0.75}>
              <MaterialCommunityIcons name="refresh" size={18} color={colors.error} />
              <Text style={styles.errorText}>Could not load duties. Tap to reload checklist.</Text>
            </TouchableOpacity>
          ) : duties.length === 0 ? (
            <View style={styles.emptyCard}>
              <View style={styles.emptyIconWrap}>
                <MaterialCommunityIcons name="clipboard-check-outline" size={28} color={colors.brand} />
              </View>
              <Text style={styles.emptyText}>You are all caught up! No duties assigned today.</Text>
            </View>
          ) : (
            <>
              {allDone ? (
                <View style={styles.completedBanner}>
                  <MaterialCommunityIcons name="checkbox-marked-circle" size={22} color="#10B981" />
                  <Text style={styles.completedText}>Great work! All duties recorded for today.</Text>
                </View>
              ) : (
                <View style={styles.progressContainer}>
                  <View style={styles.progressBarBackground}>
                    <View style={[styles.progressBarFill, { width: `${Math.round(((dutySummary?.done ?? 0) / (dutySummary?.total ?? 1)) * 100)}%` }]} />
                  </View>
                  <Text style={styles.progressLabel}>
                    {dutySummary?.done} of {dutySummary?.total} completed ({Math.round(((dutySummary?.done ?? 0) / (dutySummary?.total ?? 1)) * 100)}%)
                  </Text>
                </View>
              )}

              <View style={styles.checklistGrid}>
                {duties.map((d) => {
                  const slot = semantic.slot[d.slot as keyof typeof semantic.slot] ?? semantic.slot.ANYTIME;
                  return (
                    <TouchableOpacity
                      key={d.id}
                      style={[styles.checklistRow, d.doneToday && styles.checklistRowDone]}
                      onPress={() => navigate(d.screen)}
                      activeOpacity={0.75}
                    >
                      <View style={[styles.checklistIconBox, d.doneToday ? styles.checklistIconDone : styles.checklistIconPending]}>
                        <Text style={styles.checklistIconText}>{d.icon}</Text>
                      </View>

                      <View style={styles.checklistBody}>
                        <Text style={[styles.checklistTitle, d.doneToday && styles.checklistTitleDone]}>{d.title}</Text>
                        <Text style={styles.checklistDesc} numberOfLines={1}>{d.description}</Text>
                        <View style={styles.checklistMeta}>
                          <View style={[styles.slotBadge, { backgroundColor: slot.bg }]}>
                            <Text style={[styles.slotBadgeText, { color: slot.color }]}>{d.slot}</Text>
                          </View>
                          {d.count > 0 && (
                            <Text style={styles.recordCounter}>{d.count} log{d.count !== 1 ? "s" : ""} recorded</Text>
                          )}
                        </View>
                      </View>

                      <View style={[styles.checkboxCircle, d.doneToday ? styles.checkboxCircleDone : styles.checkboxCirclePending]}>
                        <MaterialCommunityIcons
                          name={d.doneToday ? "check" : "chevron-right"}
                          size={14}
                          color={d.doneToday ? colors.white : colors.inkLight}
                        />
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </>
          )}
        </View>

        {/* ── Featured Actions Grid (2×2 Widget Design) ── */}
        {featured.length > 0 && (
          <View style={styles.section}>
            <SectionHeader title="Priority Modules" />
            <View style={styles.widgetGrid}>
              {featured.map((a) => (
                <TouchableOpacity key={a.id} style={styles.widgetTile} onPress={() => navigate(a.screen)} activeOpacity={0.75}>
                  <View style={[styles.widgetIconFrame, { backgroundColor: a.color + "12" }]}>
                    <Icon name={a.icon} size={26} color={a.color} />
                  </View>
                  <Text style={styles.widgetLabel}>{a.label}</Text>
                  <View style={[styles.widgetBar, { backgroundColor: a.color }]} />
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {/* ── Secondary Operations (3-Column Dense Layout) ── */}
        {secondary.length > 0 && (
          <View style={styles.section}>
            <SectionHeader title="Operational Modules" />
            <View style={styles.denseGrid}>
              {secondary.map((a) => (
                <TouchableOpacity key={a.id} style={styles.denseTile} onPress={() => navigate(a.screen)} activeOpacity={0.75}>
                  <View style={[styles.denseIconFrame, { backgroundColor: a.color + "10" }]}>
                    <Icon name={a.icon} size={22} color={a.color} />
                  </View>
                  <Text style={styles.denseLabel} numberOfLines={2}>{a.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {/* ── Farm Context Telemetry Card ── */}
        {farmCount > 0 && (
          <View style={styles.farmCard}>
            <View style={styles.farmCardHeader}>
              <View style={styles.farmIconWrap}>
                <MaterialCommunityIcons name="home-city-outline" size={22} color={colors.brand} />
              </View>
              <View style={styles.farmHeaderText}>
                <Text style={styles.farmTitle}>Operational Farms</Text>
                <Text style={styles.farmSub}>Assigned to {farmCount} farm location{farmCount !== 1 ? "s" : ""}</Text>
              </View>
              <View style={styles.farmActiveBadge}>
                <View style={styles.activeDot} />
                <Text style={styles.activeText}>Active</Text>
              </View>
            </View>

            <View style={styles.cardDivider} />

            <View style={styles.farmFooterMetrics}>
              <View style={styles.metricItem}>
                <Text style={styles.metricVal}>{farmCount}</Text>
                <Text style={styles.metricLabel}>Farms</Text>
              </View>
              <View style={styles.metricDivider} />
              <View style={styles.metricItem}>
                <Text style={styles.metricVal}>{permitted.length}</Text>
                <Text style={styles.metricLabel}>Modules</Text>
              </View>
              <View style={styles.metricDivider} />
              <View style={styles.metricItem}>
                <Text style={styles.metricVal}>{ROLE_LABELS[topRole]?.split(" ")[0] ?? topRole}</Text>
                <Text style={styles.metricLabel}>Role Auth</Text>
              </View>
            </View>
          </View>
        )}

        {/* Footer Brand */}
        <View style={styles.brandFooter}>
          <MaterialCommunityIcons name="leaf" size={14} color={colors.inkLight} />
          <Text style={styles.brandText}>JOKAS ERP · v2.0.0</Text>
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}

function SectionHeader({ title }: { title: string }) {
  return (
    <View style={styles.sectionHeaderRow}>
      <Text style={styles.sectionHeaderTitle}>{title}</Text>
      <View style={styles.sectionHeaderLine} />
    </View>
  );
}

function TelemetryCard({ icon, label, value, color }: { icon: IconName; label: string; value: string; color: string }) {
  return (
    <View style={styles.telemetryCard}>
      <View style={[styles.telemetryIconBox, { backgroundColor: color + "12" }]}>
        <Icon name={icon} size={18} color={color} />
      </View>
      <View style={styles.telemetryInfo}>
        <Text style={[styles.telemetryVal, { color }]}>{value}</Text>
        <Text style={styles.telemetryLabel} numberOfLines={1}>{label}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: colors.brand },
  scroll: { backgroundColor: colors.bg, paddingBottom: spacing.xxxl },

  // ── Welcome Header Panel ────────────────
  hero: {
    backgroundColor: colors.brand,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xl,
    paddingBottom: 55,
    overflow: "hidden",
  },
  deco: {
    position: "absolute",
    borderRadius: radius.full,
    backgroundColor: "rgba(255, 255, 255, 0.07)",
  },
  decoTopLeft: { width: 200, height: 200, top: -70, left: -50 },
  decoBottomRight: { width: 150, height: 150, bottom: -40, right: -30 },

  heroLeft: { gap: 6 },
  greeting: { fontSize: font.size.sm, color: "rgba(255, 255, 255, 0.8)", fontFamily: font.family.semibold },
  heroName: { fontSize: font.size.xxl, fontFamily: font.family.extrabold, color: colors.white, letterSpacing: 0.5 },
  roleBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    alignSelf: "flex-start",
    backgroundColor: "rgba(255, 255, 255, 0.18)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.25)",
    paddingHorizontal: spacing.md,
    paddingVertical: 4,
    borderRadius: radius.full,
  },
  roleText: { fontSize: font.size.xs - 1, color: colors.white, fontFamily: font.family.bold, letterSpacing: 0.5 },

  avatarGlow: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: "rgba(255, 255, 255, 0.15)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "rgba(255, 255, 255, 0.3)",
  },
  avatarInner: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: "rgba(255, 255, 255, 0.25)",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarInitials: { fontSize: font.size.lg - 1, fontFamily: font.family.extrabold, color: colors.white, letterSpacing: 1.2 },

  // ── Date Indicator ──────────────────────
  dateStrip: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.bgCard,
    borderRadius: radius.lg,
    marginHorizontal: spacing.xl,
    marginTop: -24,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow.md,
  },
  dateText: { fontSize: font.size.sm, color: colors.inkMid, fontFamily: font.family.semibold },

  // ── Horizontal Telemetry Strip ──────────
  telemetryStrip: { paddingHorizontal: spacing.xl, paddingVertical: spacing.lg, gap: spacing.md },
  telemetryCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: colors.bgCard,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    minWidth: 165,
    ...shadow.sm,
  },
  telemetryIconBox: { width: 38, height: 38, borderRadius: radius.md, alignItems: "center", justifyContent: "center" },
  telemetryInfo: { gap: 2, flex: 1 },
  telemetryVal: { fontSize: font.size.md, fontFamily: font.family.extrabold },
  telemetryLabel: { fontSize: font.size.xs - 1, color: colors.inkLight, fontFamily: font.family.medium },

  // ── "My Day" Operations Logger ──────────
  section: { paddingHorizontal: spacing.xl, gap: spacing.md, marginTop: spacing.xs },
  sectionHeaderRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, marginBottom: 2 },
  sectionHeaderTitle: { fontSize: font.size.xs, fontFamily: font.family.bold, color: colors.inkLight, letterSpacing: 1.5, textTransform: "uppercase" },
  sectionHeaderLine: { flex: 1, height: 1, backgroundColor: colors.border },

  stateCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    padding: spacing.lg,
    backgroundColor: colors.bgCard,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow.sm,
  },
  stateText: { fontSize: font.size.sm, color: colors.inkLight, fontFamily: font.family.regular },

  errorCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    padding: spacing.lg,
    backgroundColor: colors.errorBg,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: "#FECACA",
  },
  errorText: { fontSize: font.size.sm, color: colors.error, fontFamily: font.family.semibold, flex: 1 },

  emptyCard: {
    padding: spacing.xl,
    backgroundColor: colors.bgCard,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    gap: spacing.sm,
    ...shadow.sm,
  },
  emptyIconWrap: {
    width: 56,
    height: 56,
    borderRadius: radius.xl,
    backgroundColor: colors.brandLight,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyText: { fontSize: font.size.sm, color: colors.inkLight, textAlign: "center", fontFamily: font.family.medium },

  completedBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: colors.successBg,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: "#A7F3D0",
    padding: spacing.lg,
    ...shadow.sm,
  },
  completedText: { fontSize: font.size.sm, color: "#065F46", fontFamily: font.family.semibold, flex: 1 },

  progressContainer: { gap: 8 },
  progressBarBackground: {
    height: 10,
    backgroundColor: colors.border,
    borderRadius: radius.full,
    overflow: "hidden",
  },
  progressBarFill: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    backgroundColor: colors.brand,
    borderRadius: radius.full,
  },
  progressLabel: {
    fontSize: font.size.xs,
    color: colors.inkMid,
    fontFamily: font.family.semibold,
    textAlign: "right",
  },

  checklistGrid: { gap: spacing.sm },
  checklistRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: colors.bgCard,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    ...shadow.sm,
  },
  checklistRowDone: {
    borderColor: "#A7F3D0",
    backgroundColor: colors.successBg,
  },
  checklistIconBox: {
    width: 48,
    height: 48,
    borderRadius: radius.lg,
    alignItems: "center",
    justifyContent: "center",
  },
  checklistIconPending: { backgroundColor: "#FEF3C7" },
  checklistIconDone: { backgroundColor: "#D1FAE5" },
  checklistIconText: { fontSize: 22 },

  checklistBody: { flex: 1, gap: 3 },
  checklistTitle: { fontSize: font.size.md - 1, fontFamily: font.family.bold, color: colors.ink },
  checklistTitleDone: { color: "#065F46" },
  checklistDesc: { fontSize: font.size.xs, color: colors.inkLight, fontFamily: font.family.regular },
  checklistMeta: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginTop: 2 },

  slotBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: radius.full },
  slotBadgeText: { fontSize: 9, fontFamily: font.family.bold, letterSpacing: 0.3 },
  recordCounter: { fontSize: 10, color: colors.inkLight, fontFamily: font.family.medium },

  checkboxCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
  },
  checkboxCirclePending: {
    borderColor: colors.border,
    backgroundColor: colors.bg,
  },
  checkboxCircleDone: {
    backgroundColor: "#10B981",
    borderColor: "#10B981",
  },

  // ── Featured Actions Grid (2×2 Widget) ──
  widgetGrid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md },
  widgetTile: {
    width: "47.5%",
    backgroundColor: colors.bgCard,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.md,
    overflow: "hidden",
    ...shadow.md,
  },
  widgetIconFrame: { width: 50, height: 50, borderRadius: radius.lg, alignItems: "center", justifyContent: "center" },
  widgetLabel: { fontSize: font.size.md - 1, fontFamily: font.family.bold, color: colors.ink },
  widgetBar: { position: "absolute", bottom: 0, left: 0, right: 0, height: 3, borderBottomLeftRadius: radius.xl, borderBottomRightRadius: radius.xl },

  // ── Secondary Operations (3-Col Grid) ──
  denseGrid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  denseTile: {
    width: "31.3%",
    backgroundColor: colors.bgCard,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.sm,
    gap: spacing.sm,
    ...shadow.sm,
  },
  denseIconFrame: { width: 42, height: 42, borderRadius: radius.md, alignItems: "center", justifyContent: "center" },
  denseLabel: { fontSize: 11, fontFamily: font.family.bold, color: colors.inkMid, textAlign: "center" },

  // ── Farm Context Telemetry Card ────────
  farmCard: {
    marginHorizontal: spacing.xl,
    marginTop: spacing.lg,
    backgroundColor: colors.bgCard,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: "hidden",
    ...shadow.md,
  },
  farmCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    padding: spacing.lg,
    backgroundColor: "#F8FAFC",
  },
  farmIconWrap: {
    width: 42,
    height: 42,
    borderRadius: radius.lg,
    backgroundColor: colors.white,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.border,
  },
  farmHeaderText: { flex: 1, gap: 2 },
  farmTitle: { fontSize: font.size.md - 1, fontFamily: font.family.bold, color: colors.ink },
  farmSub: { fontSize: font.size.xs, color: colors.inkLight, fontFamily: font.family.medium },
  farmActiveBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: colors.successBg,
    paddingHorizontal: spacing.md,
    paddingVertical: 5,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: "#A7F3D0",
  },
  activeDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: "#10B981" },
  activeText: { fontSize: 10, color: "#065F46", fontFamily: font.family.bold },

  cardDivider: { height: 1, backgroundColor: colors.border },
  farmFooterMetrics: { flexDirection: "row", padding: spacing.lg, backgroundColor: colors.bgCard },
  metricItem: { flex: 1, alignItems: "center", gap: 3 },
  metricVal: { fontSize: font.size.md, fontFamily: font.family.extrabold, color: colors.ink },
  metricLabel: { fontSize: font.size.xs - 1, color: colors.inkLight, fontFamily: font.family.semibold },
  metricDivider: { width: 1, backgroundColor: colors.border, marginVertical: 2 },

  brandFooter: {
    marginTop: spacing.xxxl,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
    paddingBottom: spacing.xl,
  },
  brandText: { fontSize: font.size.xs, color: colors.inkLight, fontFamily: font.family.bold, letterSpacing: 0.8 },
});
