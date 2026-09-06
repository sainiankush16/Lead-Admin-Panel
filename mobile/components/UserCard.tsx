import { Pressable, StyleSheet, Text, View } from "react-native";

import { colors } from "@/constants/theme";
import type { MappedManagedUser } from "@/utils/userManagement";

interface UserCardProps {
  user: MappedManagedUser;
  onPress: () => void;
}

export function UserCard({ user, onPress }: UserCardProps) {
  return (
    <Pressable
      style={styles.card}
      accessibilityRole="button"
      accessibilityLabel={`Manage user ${user.loginId}`}
      onPress={onPress}
    >
      <Text style={styles.login}>{user.loginId}</Text>
      <Text style={styles.name}>{user.name}</Text>
      <Text style={styles.meta}>{user.roleLabel}</Text>
      <View style={styles.row}>
        <View style={[styles.chip, user.isActive ? styles.activeChip : styles.inactiveChip]}>
          <Text style={styles.chipText}>{user.statusLabel}</Text>
        </View>
        <Text style={styles.projects}>{user.projectCountLabel}</Text>
      </View>
      <Text style={styles.manage}>Manage</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderColor: colors.cardBorder,
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12
  },
  login: { color: colors.text, fontSize: 18, fontWeight: "800" },
  name: { marginTop: 4, color: colors.textSoft, fontSize: 14 },
  meta: { marginTop: 8, color: colors.textMuted, fontSize: 13, fontWeight: "600" },
  row: {
    marginTop: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between"
  },
  chip: {
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6
  },
  activeChip: { backgroundColor: "#064E3B" },
  inactiveChip: { backgroundColor: "#7F1D1D" },
  chipText: { color: colors.text, fontWeight: "700", fontSize: 12 },
  projects: { color: colors.textMuted, fontWeight: "600" },
  manage: { marginTop: 12, color: colors.accent, fontWeight: "800" }
});
