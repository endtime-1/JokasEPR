import { StyleSheet, View, ViewProps } from "react-native";
import { colors, radius, spacing } from "../constants/theme";

type Props = ViewProps & { padded?: boolean };

export function Card({ style, padded = true, ...rest }: Props) {
  return (
    <View
      style={[styles.card, padded && styles.padded, style as any]}
      {...rest}
    />
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.bgCard,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg
  },
  padded: { padding: spacing.lg }
});
