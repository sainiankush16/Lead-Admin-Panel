import { Redirect, Tabs } from "expo-router";
import { Text } from "react-native";

import { useAuth } from "@/hooks/useAuth";
import { colors } from "@/constants/theme";

function TabLabel({ label, focused }: { label: string; focused: boolean }) {
  return (
    <Text style={{ color: focused ? colors.tabActive : colors.textMuted, fontSize: 11, fontWeight: "600" }}>
      {label}
    </Text>
  );
}

export default function AppTabsLayout() {
  const { status, user } = useAuth();

  if (status === "unauthenticated") {
    return <Redirect href="/login" />;
  }

  const isAdmin = user?.role === "admin";

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: colors.tab,
          borderTopColor: colors.cardBorder,
          height: 64,
          paddingBottom: 8,
          paddingTop: 8
        },
        tabBarActiveTintColor: colors.tabActive,
        tabBarInactiveTintColor: colors.textMuted
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Dashboard",
          tabBarLabel: ({ focused }) => <TabLabel label="Dashboard" focused={focused} />
        }}
      />
      <Tabs.Screen
        name="projects"
        options={{
          title: "Projects",
          headerShown: false,
          tabBarLabel: ({ focused }) => <TabLabel label="Projects" focused={focused} />
        }}
      />
      <Tabs.Screen
        name="search"
        options={{
          title: "Search",
          tabBarLabel: ({ focused }) => <TabLabel label="Search" focused={focused} />
        }}
      />
      <Tabs.Screen
        name="users"
        options={{
          title: "Users",
          href: isAdmin ? undefined : null,
          tabBarLabel: ({ focused }) => <TabLabel label="Users" focused={focused} />
        }}
      />
      <Tabs.Screen
        name="more"
        options={{
          title: "More",
          tabBarLabel: ({ focused }) => <TabLabel label="More" focused={focused} />
        }}
      />
    </Tabs>
  );
}
