"use strict";

/** Stable key so authenticated workspace protection does not collide with future callers. */
const AUTHENTICATED_CAPTURE_KEY = "website-crm-authenticated";

const PRODUCT_NAME = "Website CRM";

function shouldProtectAuthenticatedWorkspace(authStatus) {
  return authStatus === "authenticated";
}

function shouldShowLifecyclePrivacyOverlay(appState) {
  const state = String(appState || "");
  return state === "inactive" || state === "background";
}

function captureActiveOverlayCopy() {
  return {
    title: "Screen capture is active",
    subtitle: `${PRODUCT_NAME} content is hidden for privacy.`
  };
}

function lifecyclePrivacyOverlayCopy() {
  return {
    title: PRODUCT_NAME,
    subtitle: "Content hidden"
  };
}

/**
 * Platform capability notes for docs/tests — not marketing claims.
 * Android uses FLAG_SECURE via expo-screen-capture.
 * iOS uses Expo's secure-layer + UIScreen.isCaptured overlay + optional app-switcher blur.
 */
function platformProtectionSummary(platform) {
  if (platform === "android") {
    return {
      screenshots: "blocked",
      recording: "blocked",
      recentApps: "blank_preview",
      mechanism: "FLAG_SECURE"
    };
  }
  if (platform === "ios") {
    return {
      screenshots: "best_effort_secure_layer",
      recording: "obscured_when_detected",
      recentApps: "blur_overlay",
      mechanism: "expo-screen-capture"
    };
  }
  return {
    screenshots: "unavailable",
    recording: "unavailable",
    recentApps: "unavailable",
    mechanism: "none"
  };
}

function iosScreenshotLimitationNote() {
  return (
    "Ordinary iOS screenshots are not guaranteed to be absolutely preventable on every " +
    "device/OS configuration. Website CRM uses Expo ScreenCapture's strongest supported " +
    "protections (secure layer + capture detection overlay + app switcher blur) and must " +
    "not claim absolute iOS screenshot impossibility."
  );
}

function appSwitcherBlurIntensity() {
  return 0.75;
}

function createProtectionSessionState() {
  return {
    capturePreventionActive: false,
    appSwitcherProtectionActive: false,
    lifecycleOverlayVisible: false,
    listenerCount: 0
  };
}

function applyLifecycleAppState(state, appState) {
  const next = { ...(state || createProtectionSessionState()) };
  next.lifecycleOverlayVisible = shouldShowLifecyclePrivacyOverlay(appState);
  return next;
}

function markCapturePrevention(state, active) {
  const next = { ...(state || createProtectionSessionState()) };
  next.capturePreventionActive = Boolean(active);
  return next;
}

function markAppSwitcherProtection(state, active) {
  const next = { ...(state || createProtectionSessionState()) };
  next.appSwitcherProtectionActive = Boolean(active);
  return next;
}

function incrementListenerCount(state) {
  const next = { ...(state || createProtectionSessionState()) };
  next.listenerCount = Number(next.listenerCount || 0) + 1;
  return next;
}

function decrementListenerCount(state) {
  const next = { ...(state || createProtectionSessionState()) };
  next.listenerCount = Math.max(0, Number(next.listenerCount || 0) - 1);
  return next;
}

module.exports = {
  AUTHENTICATED_CAPTURE_KEY,
  PRODUCT_NAME,
  shouldProtectAuthenticatedWorkspace,
  shouldShowLifecyclePrivacyOverlay,
  captureActiveOverlayCopy,
  lifecyclePrivacyOverlayCopy,
  platformProtectionSummary,
  iosScreenshotLimitationNote,
  appSwitcherBlurIntensity,
  createProtectionSessionState,
  applyLifecycleAppState,
  markCapturePrevention,
  markAppSwitcherProtection,
  incrementListenerCount,
  decrementListenerCount
};
