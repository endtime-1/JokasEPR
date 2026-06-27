export const colors = {
  brand: "#f58220",
  brandDark: "#c65f0f",
  brandLight: "#fff4e7",
  brandMid: "#fde6c4",
  ink: "#17211f",
  inkMid: "#4a5754",
  inkLight: "#8fa39e",
  bg: "#f4f6f2",
  bgCard: "#ffffff",
  surface: "#fafbf8",
  border: "#e2e8df",
  borderFocus: "#f58220",
  error: "#c0392b",
  errorBg: "#fdf0ef",
  warning: "#92400e",
  warningBg: "#fffbeb",
  success: "#166534",
  successBg: "#f0fdf4",
  info: "#1e40af",
  infoBg: "#eff6ff",
  overlay: "rgba(15, 23, 21, 0.55)",
  white: "#ffffff",
  black: "#000000"
};

export const shadow = {
  sm: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 2
  },
  md: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4
  },
  lg: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.14,
    shadowRadius: 16,
    elevation: 8
  },
  brand: {
    shadowColor: "#f58220",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 6
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
  md: 10,
  lg: 16,
  xl: 20,
  xxl: 28,
  full: 999
};

export const font = {
  size: {
    xs: 11,
    sm: 13,
    md: 15,
    lg: 17,
    xl: 21,
    xxl: 26,
    xxxl: 32
  },
  weight: {
    regular: "400" as const,
    medium: "500" as const,
    semibold: "600" as const,
    bold: "700" as const,
    extrabold: "800" as const
  }
};
