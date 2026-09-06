import { Stack } from "expo-router";

export default function UsersLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: "#0F172A" },
        headerTintColor: "#F8FAFC",
        headerTitleStyle: { fontWeight: "700" },
        contentStyle: { backgroundColor: "#0F172A" }
      }}
    />
  );
}
