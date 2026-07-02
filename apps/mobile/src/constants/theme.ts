export const colors = {
  brand: "#F27A18",         // Premium deep sunset orange
  brandDark: "#C2410C",     // Terracotta rust
  brandLight: "#FFF7ED",    // Soft warm peach accent
  brandMid: "#FED7AA",      // Mid peach tint
  ink: "#0F172A",           // Deep Slate 900
  inkMid: "#334155",        // Slate 700
  inkLight: "#64748B",      // Slate 500
  bg: "#F8FAFC",            // Slate 50 backdrop
  bgCard: "#ffffff",
  surface: "#F1F5F9",       // Slate 100
  border: "#E2E8F0",        // Slate 200
  borderFocus: "#F27A18",
  error: "#EF4444",         // Rose 500
  errorBg: "#FEF2F2",       // Rose 50
  warning: "#D97706",       // Amber 600
  warningBg: "#FFFBEB",     // Amber 50
  success: "#10B981",       // Emerald 500
  successBg: "#ECFDF5",     // Emerald 50
  info: "#3B82F6",          // Blue 500
  infoBg: "#EFF6FF",        // Blue 50
  overlay: "rgba(15, 23, 42, 0.45)", // Slate 900 overlay
  white: "#ffffff",
  black: "#000000"
};

export const shadow = {
  sm: {
    shadowColor: "#64748b",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2
  },
  md: {
    shadowColor: "#334155",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 4
  },
  lg: {
    shadowColor: "#0f172a",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.08,
    shadowRadius: 20,
    elevation: 8
  },
  brand: {
    shadowColor: "#F27A18",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.20,
    shadowRadius: 10,
    elevation: 5
  }
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 40
};

export const radius = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  full: 9999
};

export const font = {
  family: {
    regular:   "Inter_400Regular",
    medium:    "Inter_500Medium",
    semibold:  "Inter_600SemiBold",
    bold:      "Inter_700Bold",
    extrabold: "Inter_800ExtraBold",
  },
  size: {
    xs:   12,
    sm:   14,
    md:   16,
    lg:   18,
    xl:   22,
    xxl:  28,
    xxxl: 36
  },
  weight: {
    regular:   "400" as const,
    medium:    "500" as const,
    semibold:  "600" as const,
    bold:      "700" as const,
    extrabold: "800" as const
  }
};

// Centralised semantic tokens — import these instead of hardcoding hex in screens
export const semantic = {
  status: {
    approved:   { color: "#10B981", bg: "#ECFDF5", border: "#A7F3D0" },
    pending:    { color: "#D97706", bg: "#FFFBEB", border: "#FDE68A" },
    submitted:  { color: "#D97706", bg: "#FFF7ED", border: "#FED7AA" },
    rejected:   { color: "#EF4444", bg: "#FEF2F2", border: "#FCA5A5" },
    draft:      { color: "#64748B", bg: "#F8FAFC", border: "#E2E8F0" },
    inProgress: { color: "#3B82F6", bg: "#EFF6FF", border: "#BFDBFE" },
    closed:     { color: "#64748B", bg: "#F8FAFC", border: "#E2E8F0" },
  },
  priority: {
    critical: { color: "#EF4444", bg: "#FEF2F2", border: "#FCA5A5" },
    high:     { color: "#D97706", bg: "#FFFBEB", border: "#FDE68A" },
    medium:   { color: "#3B82F6", bg: "#EFF6FF", border: "#BFDBFE" },
    low:      { color: "#10B981", bg: "#ECFDF5", border: "#A7F3D0" },
  },
  slot: {
    MORNING: { color: "#D97706", bg: "#FEF3C7" },
    EVENING: { color: "#8B5CF6", bg: "#F5F3FF" },
    ANYTIME: { color: "#0284C7", bg: "#E0F2FE" },
  },
};
