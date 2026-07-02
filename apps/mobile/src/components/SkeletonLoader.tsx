import { useEffect, useRef } from "react";
import { Animated, StyleSheet, View, type ViewStyle } from "react-native";
import { colors, radius, shadow, spacing } from "../constants/theme";

type BoneProps = {
  width?: number | `${number}%` | "100%";
  height?: number;
  borderRadius?: number;
  style?: ViewStyle;
};

export function Skeleton({ width = "100%", height = 14, borderRadius = radius.sm, style }: BoneProps) {
  const opacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.35, duration: 650, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 1,    duration: 650, useNativeDriver: true }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, [opacity]);

  return (
    <Animated.View
      style={[{ width: width as any, height, borderRadius, backgroundColor: colors.border, opacity }, style]}
    />
  );
}

export function SkeletonCard() {
  return (
    <View style={sk.card}>
      <View style={sk.row}>
        <Skeleton width={44} height={44} borderRadius={radius.md} />
        <View style={sk.col}>
          <Skeleton width="60%" height={15} />
          <Skeleton width="40%" height={11} />
        </View>
      </View>
      <Skeleton height={11} />
      <Skeleton width="80%" height={11} />
    </View>
  );
}

export function SkeletonListItem() {
  return (
    <View style={sk.listItem}>
      <Skeleton width={44} height={44} borderRadius={radius.md} />
      <View style={sk.col}>
        <Skeleton width="55%" height={15} />
        <Skeleton width="35%" height={11} />
      </View>
      <Skeleton width={60} height={24} borderRadius={radius.full} />
    </View>
  );
}

export function SkeletonMetricGrid() {
  return (
    <View style={sk.grid}>
      {[0, 1, 2, 3].map((i) => (
        <View key={i} style={sk.metricCell}>
          <Skeleton width={48} height={48} borderRadius={radius.md} />
          <Skeleton width={80} height={22} />
          <Skeleton width={60} height={12} />
        </View>
      ))}
    </View>
  );
}

export function SkeletonList({ count = 4 }: { count?: number }) {
  return (
    <View style={{ gap: spacing.sm }}>
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonListItem key={i} />
      ))}
    </View>
  );
}

const sk = StyleSheet.create({
  card: {
    backgroundColor: colors.bgCard, borderRadius: radius.xl,
    borderWidth: 1, borderColor: colors.border,
    padding: spacing.lg, gap: spacing.md, ...shadow.sm,
  },
  listItem: {
    flexDirection: "row", alignItems: "center", gap: spacing.md,
    backgroundColor: colors.bgCard, borderRadius: radius.xl,
    borderWidth: 1, borderColor: colors.border,
    padding: spacing.lg, ...shadow.sm,
  },
  row:       { flexDirection: "row", gap: spacing.md },
  col:       { flex: 1, gap: spacing.sm, justifyContent: "center" },
  grid:      { flexDirection: "row", flexWrap: "wrap", gap: spacing.md },
  metricCell:{
    width: "47%", backgroundColor: colors.bgCard, borderRadius: radius.xl,
    borderWidth: 1, borderColor: colors.border,
    padding: spacing.lg, gap: spacing.md, ...shadow.md,
  },
});
