import type { ComponentProps } from "react";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { colors } from "../constants/theme";

export type IconName = ComponentProps<typeof MaterialCommunityIcons>["name"];

type Props = {
  name: IconName;
  size?: number;
  color?: string;
};

export function Icon({ name, size = 20, color = colors.ink }: Props) {
  return <MaterialCommunityIcons name={name} size={size} color={color} />;
}
