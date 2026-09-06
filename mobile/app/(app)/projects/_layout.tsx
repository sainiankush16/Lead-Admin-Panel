import { Stack } from "expo-router";

import { colors } from "@/constants/theme";

export default function ProjectsStackLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.bg },
        headerTintColor: colors.text,
        headerTitleStyle: { fontWeight: "700" },
        headerShadowVisible: false,
        contentStyle: { backgroundColor: colors.bg }
      }}
    >
      <Stack.Screen name="index" options={{ title: "Projects", headerShown: false }} />
      <Stack.Screen name="new" options={{ title: "Add Project" }} />
      <Stack.Screen name="[projectId]/index" options={{ title: "Leads" }} />
      <Stack.Screen name="[projectId]/config" options={{ title: "Configuration" }} />
      <Stack.Screen name="[projectId]/lead/[rowNumber]" options={{ title: "Lead" }} />
    </Stack>
  );
}
