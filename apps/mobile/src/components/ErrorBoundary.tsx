import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { colors, font, radius, spacing } from "../constants/theme";

type Props = { children: React.ReactNode };
type State = { hasError: boolean; message: string };

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, message: "" };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, message: error?.message ?? "Unknown error" };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // In production you would send this to a crash-reporting service (e.g. Sentry)
    console.error("[ErrorBoundary]", error, info.componentStack);
  }

  handleRestart = () => {
    this.setState({ hasError: false, message: "" });
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <View style={styles.container}>
        <View style={styles.card}>
          <View style={styles.iconCircle}>
            <Text style={styles.iconText}>!</Text>
          </View>
          <Text style={styles.title}>Something went wrong</Text>
          <Text style={styles.subtitle}>
            The app encountered an unexpected problem. Your offline records are safe — tap below to recover.
          </Text>
          {__DEV__ && (
            <View style={styles.devBox}>
              <Text style={styles.devText} numberOfLines={4}>{this.state.message}</Text>
            </View>
          )}
          <TouchableOpacity style={styles.button} onPress={this.handleRestart} activeOpacity={0.8}>
            <Text style={styles.buttonText}>Restart screen</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.bg,
    padding: spacing.xxl
  },
  card: {
    width: "100%",
    backgroundColor: colors.bgCard,
    borderRadius: radius.xl,
    padding: spacing.xxl,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 16,
    elevation: 6
  },
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.errorBg,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.lg
  },
  iconText: {
    fontSize: 32,
    fontWeight: font.weight.extrabold,
    color: colors.error,
    lineHeight: 38
  },
  title: {
    fontSize: font.size.xl,
    fontWeight: font.weight.bold,
    color: colors.ink,
    marginBottom: spacing.sm,
    textAlign: "center"
  },
  subtitle: {
    fontSize: font.size.sm,
    color: colors.inkMid,
    textAlign: "center",
    lineHeight: 20,
    marginBottom: spacing.xl
  },
  devBox: {
    width: "100%",
    backgroundColor: colors.errorBg,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.lg
  },
  devText: {
    fontSize: font.size.xs,
    color: colors.error,
    fontFamily: "monospace"
  },
  button: {
    backgroundColor: colors.brand,
    borderRadius: radius.lg,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xxl,
    alignItems: "center"
  },
  buttonText: {
    color: colors.white,
    fontSize: font.size.md,
    fontWeight: font.weight.bold
  }
});
