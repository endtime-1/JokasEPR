import { useCallback, useState } from "react";
import { Alert, Linking, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import * as Location from "expo-location";
import { ScreenWrapper } from "../../components/ScreenWrapper";
import { fetchMyFieldVisits, fieldVisitCheckIn, type FieldVisit } from "../../api/endpoints";
import { colors, radius, spacing } from "../../constants/theme";

const BADGE: Record<string, { label: string; color: string; bg: string }> = {
  VERIFIED:     { label: "Verified",              color: "#166534", bg: "#dcfce7" },
  FAR:          { label: "Away from the place",   color: "#991b1b", bg: "#fee2e2" },
  LOW_ACCURACY: { label: "Rough location",        color: "#92400e", bg: "#fef3c7" },
  UNPINNED:     { label: "Recorded (no map pin)", color: "#334155", bg: "#f1f5f9" },
  PLANNED:      { label: "Not yet there",         color: "#1e40af", bg: "#dbeafe" },
  MISSED:       { label: "Missed",                color: "#991b1b", bg: "#fee2e2" },
  CANCELLED:    { label: "Cancelled",             color: "#64748b", bg: "#f1f5f9" },
};

function badgeFor(v: FieldVisit) {
  return BADGE[v.status === "CHECKED_IN" ? (v.verification ?? "UNPINNED") : v.displayStatus] ?? BADGE.PLANNED;
}

export function FieldVisitsScreen() {
  const [visits, setVisits] = useState<FieldVisit[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      const r = await fetchMyFieldVisits();
      setVisits(r.data ?? []);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load your visits");
    } finally {
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  async function checkIn(v: FieldVisit) {
    setBusyId(v.id);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("Location needed", "Allow location for this app in your phone settings, then try again. Your location is read only when you tap Check in.");
        return;
      }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      const res = await fieldVisitCheckIn(v.id, {
        latitude: pos.coords.latitude, longitude: pos.coords.longitude, accuracyM: pos.coords.accuracy ?? undefined, source: "MOBILE",
      });
      const r = res.data;
      Alert.alert(
        r.verification === "VERIFIED" ? "Checked in" : "Checked in, but...",
        r.verification === "VERIFIED" ? `Your location at ${v.placeName} is confirmed.`
          : r.verification === "FAR" ? `You are about ${r.distanceM} m from ${v.placeName}. Your manager will see this.`
          : r.verification === "LOW_ACCURACY" ? "Your phone's location is rough right now. Your manager will check the map."
          : "This visit has no map pin, so your location was recorded but not compared."
      );
      await load();
    } catch (e) {
      Alert.alert("Check-in failed", e instanceof Error ? e.message : "Please try again. You need a network connection to check in.");
    } finally {
      setBusyId("");
    }
  }

  return (
    <ScreenWrapper scroll={false}>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={load} tintColor={colors.brand} />}>
        <Text style={styles.title}>My field visits today</Text>
        <Text style={styles.sub}>Tap Check in when you arrive. Your location is captured only at that moment and compared with the planned place.</Text>
        {error ? <Text style={styles.error}>{error}</Text> : null}
        {visits.length === 0 && !refreshing && !error ? <Text style={styles.sub}>No visits planned for today. Ask your manager, or plan one on the web under Sales, Field Visits.</Text> : null}
        {visits.map((v) => {
          const b = badgeFor(v);
          return (
            <View key={v.id} style={styles.card}>
              <View style={{ flex: 1 }}>
                <Text style={styles.place}>{v.placeName}</Text>
                {v.address || v.purpose ? <Text style={styles.sub}>{[v.address, v.purpose].filter(Boolean).join(" · ")}</Text> : null}
                <View style={[styles.badge, { backgroundColor: b.bg }]}><Text style={[styles.badgeText, { color: b.color }]}>{b.label}</Text></View>
                {v.status === "CHECKED_IN" && v.distanceM != null ? <Text style={styles.sub}>{v.distanceM} m from the place</Text> : null}
              </View>
              {v.status === "PLANNED" ? (
                <View style={{ gap: spacing.sm }}>
                  <TouchableOpacity style={styles.btn} disabled={!!busyId} onPress={() => void checkIn(v)}>
                    <Text style={styles.btnText}>{busyId === v.id ? "Getting location…" : "Check in here"}</Text>
                  </TouchableOpacity>
                  {v.plannedLat != null ? (
                    <TouchableOpacity onPress={() => void Linking.openURL(`https://www.google.com/maps?q=${Number(v.plannedLat)},${Number(v.plannedLon)}`)}>
                      <Text style={styles.link}>Open map</Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
              ) : null}
            </View>
          );
        })}
      </ScrollView>
    </ScreenWrapper>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 20, fontWeight: "800", color: colors.ink },
  sub: { fontSize: 13, color: colors.inkLight, marginTop: 2 },
  error: { fontSize: 13, color: colors.error },
  card: { flexDirection: "row", gap: spacing.md, backgroundColor: colors.bgCard, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.lg },
  place: { fontSize: 16, fontWeight: "700", color: colors.ink },
  badge: { alignSelf: "flex-start", borderRadius: 99, paddingHorizontal: 10, paddingVertical: 3, marginTop: 6 },
  badgeText: { fontSize: 12, fontWeight: "700" },
  btn: { backgroundColor: colors.brand, borderRadius: radius.sm, paddingHorizontal: 14, paddingVertical: 10 },
  btnText: { color: "#fff", fontWeight: "700", fontSize: 13, textAlign: "center" },
  link: { color: colors.brand, fontSize: 12, fontWeight: "600", textAlign: "center" },
});
