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
  { id: "daily",       icon: "clipboard-list",           label: "Daily Record",    screen: "DailyPoultry",     roles: ["WORKER","OFFICER","MANAGER","CEO","SUPER_ADMIN"], color: "#16a34a", featured: true  },
  { id: "eggs",        icon: "egg",                      label: "Egg Collection",  screen: "EggCollection",    roles: ["WORKER","OFFICER","MANAGER","CEO","SUPER_ADMIN"], color: "#d97706", featured: true  },
  { id: "feed",        icon: "barley",                   label: "Feed Record",     screen: "FeedConsumption",  roles: ["WORKER","OFFICER","MANAGER","CEO","SUPER_ADMIN"], color: "#16a34a", featured: true  },
  { id: "mortality",   icon: "arrow-down-bold",          label: "Mortality",       screen: "Mortality",        roles: ["WORKER","OFFICER","MANAGER","CEO","SUPER_ADMIN"], color: "#dc2626", featured: true  },
  { id: "hipro",       icon: "calculator-variant",       label: "Feed Predict",    screen: "HiproPredict",     roles: ["OFFICER","MANAGER","CEO","SUPER_ADMIN"],          color: colors.brand },
  { id: "medication",  icon: "pill",                     label: "Medication",      screen: "Medication",       roles: ["WORKER","OFFICER","MANAGER","CEO","SUPER_ADMIN"], color: "#7c3aed" },
  { id: "vaccination", icon: "needle",                   label: "Vaccination",     screen: "Vaccination",      roles: ["WORKER","OFFICER","MANAGER","CEO","SUPER_ADMIN"], color: "#0891b2" },
  { id: "stock",       icon: "package-variant",          label: "Stock",           screen: "StockMovement",    roles: ["OFFICER","MANAGER","CEO","SUPER_ADMIN"],          color: "#d97706" },
  { id: "sales",       icon: "cart-plus",                label: "Sales Order",     screen: "SalesOrder",       roles: ["OFFICER","MANAGER","CEO","SUPER_ADMIN"],          color: "#16a34a" },
  { id: "production",  icon: "factory",                  label: "Production",      screen: "ProductionRecord", roles: ["WORKER","OFFICER","MANAGER","CEO","SUPER_ADMIN"], color: "#2563eb" },
  { id: "soya",        icon: "seed",                     label: "Soya Processing", screen: "SoyaProcessing",   roles: ["OFFICER","MANAGER","CEO","SUPER_ADMIN"],          color: "#d97706" },
  { id: "prospect",    icon: "map-marker-plus",          label: "Log Visit",       screen: "ProspectVisit",    roles: ["WORKER","OFFICER","MANAGER","CEO","SUPER_ADMIN"], color: "#d97706", featured: true },
  { id: "quality",     icon: "magnify-scan",             label: "Quality Check",   screen: "QualityCheck",     roles: ["OFFICER","MANAGER","CEO","SUPER_ADMIN"],          color: "#7c3aed" },
  { id: "attendance",  icon: "account-clock",            label: "Check-In",        screen: "AttendanceCheckIn",roles: ["WORKER","OFFICER","MANAGER","CEO","SUPER_ADMIN"], color: "#2563eb" },
  { id: "scanner",     icon: "qrcode-scan",              label: "QR Scanner",      screen: "Scanner",          roles: ["WORKER","OFFICER","MANAGER","CEO","SUPER_ADMIN"], color: "#7c3aed" },
  { id: "dashboard",   icon: "chart-areaspline",         label: "Dashboard",       screen: "Dashboard",        roles: ["MANAGER","CEO","SUPER_ADMIN"],                    color: colors.brand },
  { id: "tasks",       icon: "checkbox-marked-circle",   label: "My Tasks",        screen: "TaskList",         roles: ["WORKER","OFFICER","MANAGER","CEO","SUPER_ADMIN"], color: "#0d9488" },
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

        {/* ── Hero ── */}
        <View style={styles.hero}>
          <View style={[styles.deco, styles.decoTL]} />
          <View style={[styles.deco, styles.decoBR]} />
          <View style={[styles.deco, styles.decoMid]} />

          <View style={styles.heroLeft}>
            <Text style={styles.greeting}>{getGreeting()},</Text>
            <Text style={styles.heroName}>{firstName}</Text>
            <View style={styles.rolePill}>
              <MaterialCommunityIcons name="shield-account" size={11} color="rgba(255,255,255,0.9)" />
              <Text style={styles.roleText}>{ROLE_LABELS[topRole] ?? topRole}</Text>
            </View>
          </View>

          {/* Avatar with initials */}
          <View style={styles.avatarRing}>
            <View style={styles.avatarInner}>
              <Text style={styles.avatarInitials}>{initials}</Text>
            </View>
          </View>
        </View>

        {/* ── Date strip ── */}
        <View style={styles.stripRow}>
          <MaterialCommunityIcons name="calendar-today" size={14} color={colors.inkMid} />
          <Text style={styles.dateBadgeText}>{formatDay()}</Text>
        </View>

        {/* ── Stat chips ── */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.statStrip}>
          <StatChip icon="home-city"      label="Farms"      value={farmCount > 0 ? String(farmCount) : "—"} color={colors.brand} />
          <StatChip icon="clipboard-list" label="Operations" value={String(permitted.length)}                color="#16a34a" />
          <StatChip icon="shield-account" label="Role"       value={ROLE_LABELS[topRole]?.split(" ")[0] ?? topRole} color="#7c3aed" />
          {dutySummary && (
            <StatChip
              icon={allDone ? "check-circle" : "clock-time-four"}
              label="Today"
              value={allDone ? "All done" : `${dutySummary.done}/${dutySummary.total}`}
              color={allDone ? "#16a34a" : "#d97706"}
            />
          )}
        </ScrollView>

        {/* ── My Day ── */}
        <View style={styles.section}>
          <SectionLabel title="MY DAY" />

          {dutiesLoading ? (
            <View style={styles.dutyLoadingBox}>
              <ActivityIndicator size="small" color={colors.brand} />
              <Text style={styles.dutyLoadingText}>Loading your duties…</Text>
            </View>
          ) : dutiesError ? (
            <TouchableOpacity style={styles.dutyErrorBox} onPress={loadDuties} activeOpacity={0.75}>
              <MaterialCommunityIcons name="refresh" size={16} color="#dc2626" />
              <Text style={styles.dutyErrorText}>Could not load duties. Tap to retry.</Text>
            </TouchableOpacity>
          ) : duties.length === 0 ? (
            <View style={styles.dutyEmptyBox}>
              <View style={styles.dutyEmptyIconWrap}>
                <MaterialCommunityIcons name="party-popper" size={32} color={colors.brand} />
              </View>
              <Text style={styles.dutyEmptyText}>No duties assigned for your role today.</Text>
            </View>
          ) : (
            <>
              {allDone ? (
                <View style={styles.dutyAllDoneBanner}>
                  <MaterialCommunityIcons name="check-decagram" size={22} color="#16a34a" />
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
                  const slot = semantic.slot[d.slot as keyof typeof semantic.slot] ?? semantic.slot.ANYTIME;
                  return (
                    <TouchableOpacity
                      key={d.id}
                      style={[styles.dutyRow, d.doneToday && styles.dutyRowDone]}
                      onPress={() => navigate(d.screen)}
                      activeOpacity={0.75}
                    >
                      <View style={[styles.dutyIconBox, d.doneToday ? styles.dutyIconDone : styles.dutyIconPending]}>
                        {/* Duty icons come from API as emoji — render as text */}
                        <Text style={styles.dutyIcon}>{d.icon}</Text>
                      </View>

                      <View style={styles.dutyBody}>
                        <Text style={[styles.dutyTitle, d.doneToday && styles.dutyTitleDone]}>{d.title}</Text>
                        <Text style={styles.dutyDesc} numberOfLines={1}>{d.description}</Text>
                        <View style={styles.dutyMeta}>
                          <View style={[styles.dutySlotPill, { backgroundColor: slot.bg }]}>
                            <Text style={[styles.dutySlotText, { color: slot.color }]}>{d.slot.charAt(0) + d.slot.slice(1).toLowerCase()}</Text>
                          </View>
                          {d.count > 0 && (
                            <Text style={styles.dutyCountText}>{d.count} record{d.count !== 1 ? "s" : ""} today</Text>
                          )}
                        </View>
                      </View>

                      <View style={[styles.dutyStatus, d.doneToday ? styles.dutyStatusDone : styles.dutyStatusPending]}>
                        <MaterialCommunityIcons
                          name={d.doneToday ? "check" : "exclamation"}
                          size={14}
                          color={colors.white}
                        />
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
                  <View style={[styles.featuredIconBg, { backgroundColor: a.color + "1a" }]}>
                    <Icon name={a.icon} size={28} color={a.color} />
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
                  <View style={[styles.secondaryIconBg, { backgroundColor: a.color + "1a" }]}>
                    <Icon name={a.icon} size={24} color={a.color} />
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
                <MaterialCommunityIcons name="home-city" size={24} color={colors.brand} />
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

        <View style={styles.homeFooter}>
          <MaterialCommunityIcons name="leaf" size={12} color={colors.inkLight} />
          <Text style={styles.homeFooterText}>JOKAS ERP · v2.0</Text>
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}

function SectionLabel({ title }: { title: string }) {
  return (
    <View style={styles.sectionLabelRow}>
      <Text style={styles.sectionLabelText}>{title}</Text>
      <View style={styles.sectionLabelLine} />
    </View>
  );
}

function StatChip({ icon, label, value, color }: { icon: IconName; label: string; value: string; color: string }) {
  return (
    <View style={styles.statChip}>
      <View style={[styles.statChipIcon, { backgroundColor: color + "1a" }]}>
        <Icon name={icon} size={18} color={color} />
      </View>
      <View style={styles.statChipText}>
        <Text style={[styles.statChipValue, { color }]}>{value}</Text>
        <Text style={styles.statChipLabel}>{label}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: colors.brand },
  scroll: { backgroundColor: colors.bg, paddingBottom: spacing.xxxl },

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
  deco:    { position: "absolute", borderRadius: radius.full, backgroundColor: "rgba(255,255,255,0.08)" },
  decoTL:  { width: 220, height: 220, top: -80,  left: -60  },
  decoBR:  { width: 140, height: 140, bottom: -50, right: -20 },
  decoMid: { width: 80,  height: 80,  top: 10,   right: 90  },

  heroLeft:  { gap: 6 },
  greeting:  { fontSize: font.size.sm, color: "rgba(255,255,255,0.8)", fontFamily: font.family.medium },
  heroName:  { fontSize: font.size.xxl, fontFamily: font.family.extrabold, color: colors.white },
  rolePill:  {
    flexDirection: "row", alignItems: "center", gap: 5,
    alignSelf: "flex-start",
    backgroundColor: "rgba(255,255,255,0.2)",
    borderWidth: 1, borderColor: "rgba(255,255,255,0.25)",
    paddingHorizontal: spacing.md, paddingVertical: 4,
    borderRadius: radius.full,
  },
  roleText: { fontSize: font.size.xs, color: colors.white, fontFamily: font.family.bold, letterSpacing: 0.3 },

  avatarRing: {
    width: 74, height: 74, borderRadius: 37,
    backgroundColor: "rgba(255,255,255,0.18)",
    alignItems: "center", justifyContent: "center",
    borderWidth: 2, borderColor: "rgba(255,255,255,0.35)",
  },
  avatarInner: {
    width: 58, height: 58, borderRadius: 29,
    backgroundColor: "rgba(255,255,255,0.28)",
    alignItems: "center", justifyContent: "center",
  },
  avatarInitials: { fontSize: font.size.lg, fontFamily: font.family.extrabold, color: colors.white, letterSpacing: 1 },

  stripRow: {
    flexDirection: "row", alignItems: "center", gap: spacing.sm,
    backgroundColor: colors.bgCard,
    borderRadius: radius.lg,
    marginHorizontal: spacing.xl,
    marginTop: -28,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    ...shadow.md,
  },
  dateBadgeText: { fontSize: font.size.xs, color: colors.inkMid, fontFamily: font.family.semibold },

  statStrip:    { paddingHorizontal: spacing.xl, paddingVertical: spacing.lg, gap: spacing.sm },
  statChip: {
    flexDirection: "row", alignItems: "center", gap: spacing.sm,
    backgroundColor: colors.bgCard, borderRadius: radius.lg,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    borderWidth: 1, borderColor: colors.border, ...shadow.sm,
  },
  statChipIcon:  { width: 36, height: 36, borderRadius: radius.md, alignItems: "center", justifyContent: "center" },
  statChipText:  { gap: 1 },
  statChipValue: { fontSize: font.size.md, fontFamily: font.family.bold },
  statChipLabel: { fontSize: font.size.xs, color: colors.inkLight, fontFamily: font.family.medium },

  section:        { paddingHorizontal: spacing.xl, gap: spacing.md, marginTop: spacing.xs },
  sectionLabelRow:{ flexDirection: "row", alignItems: "center", gap: spacing.md },
  sectionLabelText:{ fontSize: font.size.xs, fontFamily: font.family.bold, color: colors.inkLight, letterSpacing: 1.2 },
  sectionLabelLine:{ flex: 1, height: 1, backgroundColor: colors.border },

  dutyLoadingBox:  { flexDirection: "row", alignItems: "center", gap: spacing.md, padding: spacing.lg, backgroundColor: colors.bgCard, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border },
  dutyLoadingText: { fontSize: font.size.sm, color: colors.inkLight, fontFamily: font.family.regular },
  dutyErrorBox:    { flexDirection: "row", alignItems: "center", gap: spacing.sm, padding: spacing.lg, backgroundColor: "#fef2f2", borderRadius: radius.lg, borderWidth: 1, borderColor: "#fca5a5" },
  dutyErrorText:   { fontSize: font.size.sm, color: "#dc2626", fontFamily: font.family.medium, flex: 1 },
  dutyEmptyBox:    { padding: spacing.xl, backgroundColor: colors.bgCard, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, alignItems: "center", gap: spacing.sm },
  dutyEmptyIconWrap:{ width: 64, height: 64, borderRadius: radius.xxl, backgroundColor: colors.brandLight, alignItems: "center", justifyContent: "center" },
  dutyEmptyText:   { fontSize: font.size.sm, color: colors.inkLight, textAlign: "center", fontFamily: font.family.regular },

  dutyAllDoneBanner: {
    flexDirection: "row", alignItems: "center", gap: spacing.md,
    backgroundColor: "#f0fdf4", borderRadius: radius.lg,
    borderWidth: 1, borderColor: "#86efac", padding: spacing.lg,
  },
  dutyAllDoneText: { fontSize: font.size.sm, color: "#15803d", fontFamily: font.family.semibold, flex: 1 },

  dutyProgressBar: {
    height: 32, backgroundColor: colors.bgCard,
    borderRadius: radius.full, borderWidth: 1, borderColor: colors.border,
    overflow: "hidden", justifyContent: "center",
  },
  dutyProgressFill:  { position: "absolute", left: 0, top: 0, bottom: 0, backgroundColor: colors.brand + "30", borderRadius: radius.full },
  dutyProgressLabel: { fontSize: font.size.xs, color: colors.inkMid, fontFamily: font.family.semibold, textAlign: "center" },
  dutyList: { gap: spacing.sm },

  dutyRow:     { flexDirection: "row", alignItems: "center", gap: spacing.md, backgroundColor: colors.bgCard, borderRadius: radius.xl, borderWidth: 1, borderColor: colors.border, padding: spacing.md, ...shadow.sm },
  dutyRowDone: { borderColor: "#86efac", backgroundColor: "#f0fdf4" },
  dutyIconBox:     { width: 50, height: 50, borderRadius: radius.lg, alignItems: "center", justifyContent: "center" },
  dutyIconPending: { backgroundColor: "#fef9c3" },
  dutyIconDone:    { backgroundColor: "#dcfce7" },
  dutyIcon:        { fontSize: 24 },
  dutyBody:        { flex: 1, gap: 3 },
  dutyTitle:       { fontSize: font.size.md, fontFamily: font.family.bold, color: colors.ink },
  dutyTitleDone:   { color: "#15803d" },
  dutyDesc:        { fontSize: font.size.xs, color: colors.inkLight, fontFamily: font.family.regular },
  dutyMeta:        { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginTop: 2 },
  dutySlotPill:    { paddingHorizontal: 8, paddingVertical: 2, borderRadius: radius.full },
  dutySlotText:    { fontSize: 10, fontFamily: font.family.bold },
  dutyCountText:   { fontSize: 10, color: colors.inkLight, fontFamily: font.family.regular },
  dutyStatus:      { width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  dutyStatusDone:  { backgroundColor: "#16a34a" },
  dutyStatusPending:{ backgroundColor: "#d97706" },

  featuredGrid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md },
  featuredTile: {
    width: "47.5%", backgroundColor: colors.bgCard,
    borderRadius: radius.xl, borderWidth: 1, borderColor: colors.border,
    padding: spacing.lg, gap: spacing.md, overflow: "hidden", ...shadow.md,
  },
  featuredIconBg: { width: 56, height: 56, borderRadius: radius.lg, alignItems: "center", justifyContent: "center" },
  featuredLabel:  { fontSize: font.size.md, fontFamily: font.family.bold, color: colors.ink },
  featuredAccent: { position: "absolute", bottom: 0, left: 0, right: 0, height: 3, borderBottomLeftRadius: radius.xl, borderBottomRightRadius: radius.xl },

  secondaryGrid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md },
  secondaryTile: {
    width: "30%", backgroundColor: colors.bgCard,
    borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border,
    alignItems: "center", justifyContent: "center",
    padding: spacing.md, paddingBottom: spacing.lg, gap: spacing.sm,
    aspectRatio: 0.9, ...shadow.sm,
  },
  secondaryIconBg:  { width: 48, height: 48, borderRadius: radius.md, alignItems: "center", justifyContent: "center" },
  secondaryLabel:   { fontSize: font.size.xs, fontFamily: font.family.semibold, color: colors.ink, textAlign: "center" },

  farmCard: {
    marginHorizontal: spacing.xl, marginTop: spacing.xl,
    backgroundColor: colors.bgCard, borderRadius: radius.xl,
    borderWidth: 1, borderColor: colors.brandMid, overflow: "hidden", ...shadow.md,
  },
  farmCardHeader: { flexDirection: "row", alignItems: "center", gap: spacing.md, padding: spacing.lg, backgroundColor: colors.brandLight },
  farmCardIcon:   { width: 48, height: 48, borderRadius: radius.md, backgroundColor: colors.brandMid, alignItems: "center", justifyContent: "center" },
  farmCardText:   { flex: 1, gap: 2 },
  farmCardTitle:  { fontSize: font.size.md, fontFamily: font.family.bold, color: colors.brandDark },
  farmCardSub:    { fontSize: font.size.xs, color: colors.brand, fontFamily: font.family.medium },
  farmActiveBadge:{ flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: "#f0fdf4", paddingHorizontal: spacing.md, paddingVertical: 5, borderRadius: radius.full, borderWidth: 1, borderColor: "#86efac" },
  farmActiveDot:  { width: 7, height: 7, borderRadius: 4, backgroundColor: "#22c55e" },
  farmActiveBadgeText:{ fontSize: font.size.xs, color: colors.success, fontFamily: font.family.bold },
  farmCardDivider:{ height: 1, backgroundColor: colors.border },
  farmCardFooter: { flexDirection: "row", padding: spacing.lg, backgroundColor: colors.bgCard },
  farmMetric:     { flex: 1, alignItems: "center", gap: 3 },
  farmMetricValue:{ fontSize: font.size.lg, fontFamily: font.family.extrabold, color: colors.ink },
  farmMetricLabel:{ fontSize: font.size.xs, color: colors.inkLight, fontFamily: font.family.medium },
  farmMetricSep:  { width: 1, backgroundColor: colors.border, marginVertical: 4 },

  homeFooter:     { marginTop: spacing.xxl, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.xs, paddingBottom: spacing.lg },
  homeFooterText: { fontSize: font.size.xs, color: colors.inkLight, fontFamily: font.family.medium, letterSpacing: 0.5 },
});
