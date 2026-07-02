import { createContext, useContext, useRef, useState, type ReactNode } from "react";
import { Animated, StyleSheet, Text } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { font, radius, shadow, spacing } from "../constants/theme";

type ToastType = "success" | "error" | "warning" | "info";

export type ToastOptions = {
  message: string;
  type?: ToastType;
  duration?: number;
};

type ToastCtx = { show: (opts: ToastOptions) => void };

const Ctx = createContext<ToastCtx>({ show: () => {} });

export const useToast = () => useContext(Ctx);

const CFG: Record<ToastType, { icon: string; color: string; bg: string; border: string }> = {
  success: { icon: "check-circle",  color: "#15803d", bg: "#f0fdf4", border: "#86efac" },
  error:   { icon: "alert-circle",  color: "#dc2626", bg: "#fef2f2", border: "#fca5a5" },
  warning: { icon: "alert",         color: "#d97706", bg: "#fffbeb", border: "#fde68a" },
  info:    { icon: "information",   color: "#2563eb", bg: "#eff6ff", border: "#bfdbfe" },
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const insets = useSafeAreaInsets();
  const [visible, setVisible] = useState(false);
  const [opts, setOpts] = useState<Required<ToastOptions>>({ message: "", type: "success", duration: 3000 });
  const translateY = useRef(new Animated.Value(120)).current;
  const opacity    = useRef(new Animated.Value(0)).current;
  const timer      = useRef<ReturnType<typeof setTimeout>>(undefined);

  function show(options: ToastOptions) {
    if (timer.current) clearTimeout(timer.current);
    setOpts({ type: "success", duration: 3000, ...options });
    setVisible(true);
    translateY.setValue(120);
    opacity.setValue(0);

    Animated.parallel([
      Animated.spring(translateY, { toValue: 0, useNativeDriver: true, damping: 18, stiffness: 200 }),
      Animated.timing(opacity,    { toValue: 1, duration: 180, useNativeDriver: true }),
    ]).start();

    timer.current = setTimeout(() => {
      Animated.parallel([
        Animated.timing(translateY, { toValue: 120, duration: 250, useNativeDriver: true }),
        Animated.timing(opacity,    { toValue: 0,   duration: 250, useNativeDriver: true }),
      ]).start(() => setVisible(false));
    }, options.duration ?? 3000);
  }

  const cfg = CFG[opts.type];

  return (
    <Ctx.Provider value={{ show }}>
      {children}
      {visible && (
        <Animated.View
          style={[
            styles.toast,
            { bottom: insets.bottom + spacing.xl, backgroundColor: cfg.bg, borderColor: cfg.border },
            { transform: [{ translateY }], opacity },
          ]}
        >
          <MaterialCommunityIcons name={cfg.icon as any} size={20} color={cfg.color} />
          <Text style={[styles.message, { color: cfg.color }]} numberOfLines={2}>
            {opts.message}
          </Text>
        </Animated.View>
      )}
    </Ctx.Provider>
  );
}

const styles = StyleSheet.create({
  toast: {
    position: "absolute",
    left: spacing.xl, right: spacing.xl,
    flexDirection: "row", alignItems: "center", gap: spacing.md,
    padding: spacing.lg, borderRadius: radius.xl, borderWidth: 1,
    ...shadow.lg,
  },
  message: { flex: 1, fontSize: font.size.sm, fontFamily: font.family.semibold },
});
