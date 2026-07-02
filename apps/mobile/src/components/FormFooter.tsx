import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { Button } from "./Button";
import { colors, font, radius, spacing } from "../constants/theme";

type Props = {
  saveLabel?: string;
  onSave: () => void;
  loading?: boolean;
  onCancel?: () => void;
};

export function FormFooter({ saveLabel = "Save", onSave, loading = false, onCancel }: Props) {
  const navigation = useNavigation<any>();
  const handleCancel = onCancel ?? (() => navigation.goBack());

  return (
    <View style={styles.row}>
      <TouchableOpacity style={styles.cancelBtn} onPress={handleCancel} activeOpacity={0.7}>
        <Text style={styles.cancelText}>Cancel</Text>
      </TouchableOpacity>
      <View style={styles.saveBtn}>
        <Button label={saveLabel} loading={loading} onPress={onSave} size="lg" />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  cancelBtn: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md + 2,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bgCard,
  },
  cancelText: {
    fontSize: font.size.md,
    fontFamily: font.family.semibold,
    color: colors.inkMid,
  },
  saveBtn: { flex: 1 },
});
