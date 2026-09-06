import { StyleSheet, Text, View } from "react-native";

import { colors } from "@/constants/theme";
import {
  displayLeadIdentityEmail,
  displayLeadIdentityName,
  displayLeadIdentityPhone,
  displayLeadIdentityStatus
} from "@/utils/leadWorkflow";

interface LeadDetailHeaderProps {
  projectName: string;
  name: string;
  phone: string;
  email: string;
  status: string;
}

export function LeadDetailHeader({
  projectName,
  name,
  phone,
  email,
  status
}: LeadDetailHeaderProps) {
  const displayName = displayLeadIdentityName(name);
  const displayPhone = displayLeadIdentityPhone(phone);
  const displayEmail = displayLeadIdentityEmail(email);
  const displayStatus = displayLeadIdentityStatus(status);

  return (
    <View style={styles.wrap} accessibilityRole="header">
      <Text style={styles.projectName}>{projectName}</Text>
      <Text style={styles.leadName} accessibilityRole="header">
        {displayName}
      </Text>

      <View style={styles.statusChip} accessibilityLabel={`Lead Status ${displayStatus}`}>
        <Text style={styles.statusLabel}>Status</Text>
        <Text style={styles.statusValue}>{displayStatus}</Text>
      </View>

      <View style={styles.metaRow}>
        <View style={styles.metaBlock}>
          <Text style={styles.metaLabel}>Phone</Text>
          <Text style={styles.metaValue}>{displayPhone}</Text>
        </View>
        <View style={styles.metaBlock}>
          <Text style={styles.metaLabel}>Email</Text>
          <Text style={styles.metaValue}>{displayEmail}</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: 8 },
  projectName: { color: colors.textMuted, fontSize: 13, fontWeight: "600" },
  leadName: {
    marginTop: 6,
    color: colors.text,
    fontSize: 28,
    fontWeight: "800"
  },
  statusChip: {
    marginTop: 14,
    alignSelf: "flex-start",
    borderWidth: 1,
    borderColor: colors.accent,
    backgroundColor: colors.card,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8
  },
  statusLabel: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.4
  },
  statusValue: {
    marginTop: 2,
    color: colors.accent,
    fontSize: 16,
    fontWeight: "800"
  },
  metaRow: {
    marginTop: 14,
    flexDirection: "row",
    gap: 12
  },
  metaBlock: { flex: 1 },
  metaLabel: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.4,
    marginBottom: 4
  },
  metaValue: {
    color: colors.textSoft,
    fontSize: 15,
    lineHeight: 20,
    fontWeight: "600"
  }
});
