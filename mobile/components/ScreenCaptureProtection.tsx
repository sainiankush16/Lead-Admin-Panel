import { type ReactNode, useEffect, useState } from "react";
import { AppState, type AppStateStatus, Platform, StyleSheet, Text, View } from "react-native";
import * as ScreenCapture from "expo-screen-capture";

// Shared pure logic (also covered by Node tests).
// eslint-disable-next-line @typescript-eslint/no-require-imports
const core = require("../utils/screenCaptureProtectionCore.js") as {
  AUTHENTICATED_CAPTURE_KEY: string;
  shouldShowLifecyclePrivacyOverlay: (appState: string | null | undefined) => boolean;
  lifecyclePrivacyOverlayCopy: () => { title: string; subtitle: string };
  appSwitcherBlurIntensity: () => number;
};

type Props = {
  children: ReactNode;
  /** When false, native prevention is not enabled (e.g. auth redirect). Default true. */
  enabled?: boolean;
};

/**
 * Applies platform screen-capture privacy to the authenticated CRM workspace.
 * Android: FLAG_SECURE via expo-screen-capture (screenshots, recording, recent-apps blank).
 * iOS: Expo secure-layer + capture overlay + app-switcher blur; JS lifecycle overlay as backup.
 * Does not request media permissions and does not log or upload capture events.
 */
export function ScreenCaptureProtection({ children, enabled = true }: Props) {
  const [lifecycleOverlayVisible, setLifecycleOverlayVisible] = useState(() =>
    core.shouldShowLifecyclePrivacyOverlay(AppState.currentState)
  );

  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;
    const key = core.AUTHENTICATED_CAPTURE_KEY;

    (async () => {
      try {
        await ScreenCapture.preventScreenCaptureAsync(key);
        if (cancelled) return;
        if (Platform.OS === "ios" && ScreenCapture.enableAppSwitcherProtectionAsync) {
          await ScreenCapture.enableAppSwitcherProtectionAsync(core.appSwitcherBlurIntensity());
        }
      } catch {
        // Native module may be unavailable on web/unsupported environments; fail closed quietly.
      }
    })();

    return () => {
      cancelled = true;
      void (async () => {
        try {
          if (Platform.OS === "ios" && ScreenCapture.disableAppSwitcherProtectionAsync) {
            await ScreenCapture.disableAppSwitcherProtectionAsync();
          }
          await ScreenCapture.allowScreenCaptureAsync(key);
        } catch {
          // Ignore teardown errors during unmount/logout.
        }
      })();
    };
  }, [enabled]);

  useEffect(() => {
    if (!enabled) {
      setLifecycleOverlayVisible(false);
      return;
    }

    const onChange = (next: AppStateStatus) => {
      setLifecycleOverlayVisible(core.shouldShowLifecyclePrivacyOverlay(next));
    };

    setLifecycleOverlayVisible(core.shouldShowLifecyclePrivacyOverlay(AppState.currentState));
    const sub = AppState.addEventListener("change", onChange);
    return () => {
      sub.remove();
    };
  }, [enabled]);

  const copy = core.lifecyclePrivacyOverlayCopy();

  return (
    <View style={styles.root} collapsable={false}>
      {children}
      {enabled && lifecycleOverlayVisible ? (
        <View
          style={styles.overlay}
          pointerEvents="auto"
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          accessibilityLabel={`${copy.title}. ${copy.subtitle}`}
        >
          <Text style={styles.title}>{copy.title}</Text>
          <Text style={styles.subtitle}>{copy.subtitle}</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1
  },
  overlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: "#0F172A",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
    zIndex: 9999,
    elevation: 9999
  },
  title: {
    color: "#F8FAFC",
    fontSize: 20,
    fontWeight: "700",
    textAlign: "center",
    marginBottom: 8
  },
  subtitle: {
    color: "#94A3B8",
    fontSize: 15,
    textAlign: "center"
  }
});
