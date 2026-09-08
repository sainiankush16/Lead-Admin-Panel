import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  type StyleProp,
  type ViewStyle
} from "react-native";

import { AppIcon } from "@/components/ui/AppIcon";
import type { AppIconName } from "@/constants/icons";
import { colors } from "@/constants/theme";

type ActionVariant = "default" | "primary" | "accent" | "danger" | "ghost";

interface ActionButtonProps {
  label: string;
  icon: AppIconName;
  onPress: () => void;
  disabled?: boolean;
  busy?: boolean;
  variant?: ActionVariant;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  style?: StyleProp<ViewStyle>;
  compact?: boolean;
}

const VARIANT_STYLES: Record<
  ActionVariant,
  { bg: string; border: string; text: string; icon: string }
> = {
  default: {
    bg: "#334155",
    border: "#334155",
    text: colors.text,
    icon: colors.text
  },
  primary: {
    bg: colors.accent,
    border: colors.accent,
    text: colors.bg,
    icon: colors.bg
  },
  accent: {
    bg: colors.accent,
    border: colors.accent,
    text: colors.bg,
    icon: colors.bg
  },
  danger: {
    bg: "transparent",
    border: colors.danger,
    text: colors.danger,
    icon: colors.danger
  },
  ghost: {
    bg: colors.bg,
    border: colors.cardBorder,
    text: colors.textSoft,
    icon: colors.textSoft
  }
};

/**
 * Compact icon + label control. Always requires a real onPress handler.
 */
export function ActionButton({
  label,
  icon,
  onPress,
  disabled = false,
  busy = false,
  variant = "default",
  accessibilityLabel,
  accessibilityHint,
  style,
  compact = false
}: ActionButtonProps) {
  const palette = VARIANT_STYLES[variant];
  const isDisabled = disabled || busy;

  return (
    <Pressable
      style={[
        styles.base,
        compact ? styles.compact : styles.regular,
        {
          backgroundColor: palette.bg,
          borderColor: palette.border
        },
        isDisabled && styles.disabled,
        style
      ]}
      disabled={isDisabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel || label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: isDisabled, busy }}
      onPress={onPress}
    >
      {busy ? (
        <ActivityIndicator color={palette.icon} />
      ) : (
        <AppIcon name={icon} size={compact ? 16 : 18} color={palette.icon} />
      )}
      <Text style={[styles.label, { color: palette.text }, compact && styles.labelCompact]}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderWidth: 1,
    borderRadius: 10
  },
  regular: {
    minHeight: 44,
    paddingHorizontal: 14,
    paddingVertical: 10
  },
  compact: {
    minHeight: 40,
    paddingHorizontal: 12,
    paddingVertical: 8
  },
  disabled: { opacity: 0.4 },
  label: {
    fontWeight: "700",
    fontSize: 14
  },
  labelCompact: {
    fontSize: 13
  }
});
