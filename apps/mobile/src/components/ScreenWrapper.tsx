import { useLayoutEffect } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { colors, spacing } from "../constants/theme";
import { SyncBanner } from "./SyncBanner";

type Props = {
  children: React.ReactNode;
  scroll?: boolean;
  showSync?: boolean;
  /** Renders outside the ScrollView, pinned to the bottom of the screen */
  footer?: React.ReactNode;
};

export function ScreenWrapper({ children, scroll = true, showSync = true, footer }: Props) {
  const navigation = useNavigation<any>();

  useLayoutEffect(() => {
    navigation.setOptions({
      headerLeft: () => (
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <MaterialCommunityIcons name="arrow-left" size={24} color={colors.brand} />
        </TouchableOpacity>
      ),
    });
  }, [navigation]);

  const content = scroll ? (
    <ScrollView
      contentContainerStyle={[styles.content, footer ? styles.contentWithFooter : null]}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      {children}
    </ScrollView>
  ) : (
    <View style={styles.fill}>{children}</View>
  );

  return (
    <SafeAreaView style={styles.safe} edges={["bottom"]}>
      {showSync && <SyncBanner />}
      <KeyboardAvoidingView
        style={styles.fill}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        {content}
        {footer ? <View style={styles.footer}>{footer}</View> : null}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:             { flex: 1, backgroundColor: colors.bg },
  fill:             { flex: 1 },
  content:          { padding: spacing.xl, gap: spacing.lg, paddingBottom: spacing.xxxl },
  contentWithFooter:{ paddingBottom: spacing.lg },
  backBtn:          { paddingHorizontal: 8 },
  footer: {
    padding: spacing.xl,
    paddingTop: spacing.md,
    backgroundColor: colors.bg,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
});
