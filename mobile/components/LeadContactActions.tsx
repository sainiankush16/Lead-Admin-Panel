import { StyleSheet, View } from "react-native";

import { ActionButton } from "@/components/ui/ActionButton";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { contactActionAvailability } from "@/utils/leadContactActivity";
import { openCall, openEmail, openWhatsApp } from "@/utils/linking";

interface LeadContactActionsProps {
  name: string;
  telHref: string | null;
  waHref: string | null;
  mailtoHref: string | null;
}

export function LeadContactActions({
  name,
  telHref,
  waHref,
  mailtoHref
}: LeadContactActionsProps) {
  const availability = contactActionAvailability({ telHref, waHref, mailtoHref });

  return (
    <View style={styles.wrap}>
      <SectionHeader title="Contact" />
      <View style={styles.actions}>
        <ActionButton
          label="Call"
          icon="call"
          style={styles.action}
          disabled={!availability.canCall}
          accessibilityLabel={`Call ${name}`}
          onPress={() => {
            void openCall(availability.telHref);
          }}
        />
        <ActionButton
          label="WhatsApp"
          icon="whatsapp"
          variant="accent"
          style={styles.action}
          disabled={!availability.canWhatsApp}
          accessibilityLabel={`WhatsApp ${name}`}
          onPress={() => {
            void openWhatsApp(availability.waHref);
          }}
        />
        <ActionButton
          label="Email"
          icon="email"
          style={styles.action}
          disabled={!availability.canEmail}
          accessibilityLabel={`Email ${name}`}
          onPress={() => {
            void openEmail(availability.mailtoHref);
          }}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: 18, marginBottom: 18 },
  actions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10
  },
  action: {
    flexGrow: 1,
    flexBasis: "30%"
  }
});
