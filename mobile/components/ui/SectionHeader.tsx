import { StyleSheet, Text, View } from "react-native";

import { AppIcon } from "@/components/ui/AppIcon";
import type { AppIconName } from "@/constants/icons";
import { colors } from "@/constants/theme";

interface SectionHeaderProps {
  title: string;
  icon?: AppIconName;
  subtitle?: string;
}

export function SectionHeader({ title, icon, subtitle }: SectionHeaderProps) {
  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        {icon ? <AppIcon name={icon} size={16} color={colors.accent} /> : null}
        <Text style={styles.title}>{title}</Text>
      </View>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: 10, gap: 4 },
  row: { flexDirection: "row", alignItems: "center", gap: 8 },
  title: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0.4,
    textTransform: "uppercase"
  },
  subtitle: {
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 16
  }
});
