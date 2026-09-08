import { Redirect, Tabs } from "expo-router";
import { Text } from "react-native";

import { AppIcon } from "@/components/ui/AppIcon";
import { ScreenCaptureProtection } from "@/components/ScreenCaptureProtection";
import { useAuth } from "@/hooks/useAuth";
import type { AppIconName } from "@/constants/icons";
import { colors } from "@/constants/theme";

function TabLabel({ label, focused }: { label: string; focused: boolean }) {
  return (
    <Text style={{ color: focused ? colors.tabActive : colors.textMuted, fontSize: 11, fontWeight: "600" }}>
      {label}
    </Text>
  );
}

function TabBarIcon({ name, focused }: { name: AppIconName; focused: boolean }) {
  return <AppIcon name={name} size={20} color={focused ? colors.tabActive : colors.textMuted} />;
}

export default function AppTabsLayout() {
  const { status, user } = useAuth();

  if (status === "unauthenticated") {
    return <Redirect href="/login" />;
  }

  const isAdmin = user?.role === "admin";

  return (
    <ScreenCaptureProtection enabled>
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
            tabBarIcon: ({ focused }) => <TabBarIcon name="dashboard" focused={focused} />,
            tabBarLabel: ({ focused }) => <TabLabel label="Dashboard" focused={focused} />
          }}
        />
        <Tabs.Screen
          name="projects"
          options={{
            title: "Projects",
            headerShown: false,
            tabBarIcon: ({ focused }) => <TabBarIcon name="folder" focused={focused} />,
            tabBarLabel: ({ focused }) => <TabLabel label="Projects" focused={focused} />
          }}
        />
        <Tabs.Screen
          name="search"
          options={{
            title: "Search",
            tabBarIcon: ({ focused }) => <TabBarIcon name="search" focused={focused} />,
            tabBarLabel: ({ focused }) => <TabLabel label="Search" focused={focused} />
          }}
        />
        <Tabs.Screen
          name="users"
          options={{
            title: "Users",
            href: isAdmin ? undefined : null,
            tabBarIcon: ({ focused }) => <TabBarIcon name="users" focused={focused} />,
            tabBarLabel: ({ focused }) => <TabLabel label="Users" focused={focused} />
          }}
        />
        <Tabs.Screen
          name="more"
          options={{
            title: "More",
            tabBarIcon: ({ focused }) => <TabBarIcon name="more" focused={focused} />,
            tabBarLabel: ({ focused }) => <TabLabel label="More" focused={focused} />
          }}
        />
      </Tabs>
    </ScreenCaptureProtection>
  );
}
