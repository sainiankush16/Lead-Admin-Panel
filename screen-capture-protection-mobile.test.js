"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");

const {
  AUTHENTICATED_CAPTURE_KEY,
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
} = require("./mobile/utils/screenCaptureProtectionCore.js");

const root = __dirname;
const mobile = path.join(root, "mobile");

test("authenticated workspace is protected; unauthenticated is not", () => {
  assert.equal(shouldProtectAuthenticatedWorkspace("authenticated"), true);
  assert.equal(shouldProtectAuthenticatedWorkspace("unauthenticated"), false);
  assert.equal(shouldProtectAuthenticatedWorkspace("loading"), false);
  assert.equal(AUTHENTICATED_CAPTURE_KEY, "website-crm-authenticated");
});

test("lifecycle privacy overlay toggles with app state and cleans up", () => {
  assert.equal(shouldShowLifecyclePrivacyOverlay("active"), false);
  assert.equal(shouldShowLifecyclePrivacyOverlay("inactive"), true);
  assert.equal(shouldShowLifecyclePrivacyOverlay("background"), true);

  let state = createProtectionSessionState();
  state = applyLifecycleAppState(state, "background");
  assert.equal(state.lifecycleOverlayVisible, true);
  state = applyLifecycleAppState(state, "active");
  assert.equal(state.lifecycleOverlayVisible, false);

  state = markCapturePrevention(state, true);
  state = markAppSwitcherProtection(state, true);
  assert.equal(state.capturePreventionActive, true);
  assert.equal(state.appSwitcherProtectionActive, true);

  state = incrementListenerCount(state);
  state = incrementListenerCount(state);
  assert.equal(state.listenerCount, 2);
  state = decrementListenerCount(state);
  state = decrementListenerCount(state);
  state = decrementListenerCount(state);
  assert.equal(state.listenerCount, 0);
});

test("overlay copy is privacy-focused and brand-correct", () => {
  const capture = captureActiveOverlayCopy();
  assert.match(capture.title, /Screen capture is active/i);
  assert.match(capture.subtitle, /Website CRM/);
  assert.doesNotMatch(capture.subtitle, /CHATURX|ChaturX|Ankush CRM/);

  const life = lifecyclePrivacyOverlayCopy();
  assert.equal(life.title, "Website CRM");
  assert.match(life.subtitle, /hidden/i);
  assert.ok(appSwitcherBlurIntensity() > 0 && appSwitcherBlurIntensity() <= 1);
});

test("platform summaries distinguish Android FLAG_SECURE from iOS limitations", () => {
  const android = platformProtectionSummary("android");
  assert.equal(android.mechanism, "FLAG_SECURE");
  assert.equal(android.screenshots, "blocked");
  assert.equal(android.recentApps, "blank_preview");

  const ios = platformProtectionSummary("ios");
  assert.equal(ios.screenshots, "best_effort_secure_layer");
  assert.equal(ios.recording, "obscured_when_detected");
  assert.equal(ios.recentApps, "blur_overlay");
  assert.match(iosScreenshotLimitationNote(), /not guaranteed/i);
});

test("authenticated app layout wraps ScreenCaptureProtection; login does not", () => {
  const appLayout = fs.readFileSync(path.join(mobile, "app/(app)/_layout.tsx"), "utf8");
  const login = fs.readFileSync(path.join(mobile, "app/login.tsx"), "utf8");
  const rootLayout = fs.readFileSync(path.join(mobile, "app/_layout.tsx"), "utf8");
  const component = fs.readFileSync(
    path.join(mobile, "components/ScreenCaptureProtection.tsx"),
    "utf8"
  );

  assert.match(appLayout, /ScreenCaptureProtection/);
  assert.match(appLayout, /enabled/);
  assert.doesNotMatch(login, /ScreenCaptureProtection|preventScreenCapture/);
  assert.doesNotMatch(rootLayout, /ScreenCaptureProtection/);

  assert.match(component, /preventScreenCaptureAsync/);
  assert.match(component, /allowScreenCaptureAsync/);
  assert.match(component, /enableAppSwitcherProtectionAsync/);
  assert.match(component, /disableAppSwitcherProtectionAsync/);
  assert.match(component, /AppState\.addEventListener/);
  assert.match(component, /sub\.remove\(\)/);
  assert.doesNotMatch(component, /READ_MEDIA_IMAGES|requestPermissionsAsync|addScreenshotListener/);
  assert.doesNotMatch(component, /analytics|telemetry|fetch\(|AsyncStorage/);
  assert.doesNotMatch(component, /CHATURX|ChaturX|Ankush CRM/);
});

test("public legal pages are not wrapped by mobile screen capture protection", () => {
  const privacy = fs.readFileSync(path.join(root, "public/privacy.html"), "utf8");
  const terms = fs.readFileSync(path.join(root, "public/terms.html"), "utf8");
  const deleteAccount = fs.readFileSync(path.join(root, "public/delete-account.html"), "utf8");
  assert.doesNotMatch(privacy, /ScreenCaptureProtection|FLAG_SECURE/);
  assert.doesNotMatch(terms, /ScreenCaptureProtection|FLAG_SECURE/);
  assert.doesNotMatch(deleteAccount, /ScreenCaptureProtection|FLAG_SECURE/);
});

test("expo-screen-capture dependency and identity preserved", () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(mobile, "package.json"), "utf8"));
  const appJson = JSON.parse(fs.readFileSync(path.join(mobile, "app.json"), "utf8"));
  assert.match(String(pkg.dependencies["expo-screen-capture"]), /57/);
  assert.equal(appJson.expo.name, "Website CRM");
  assert.equal(appJson.expo.android.package, "com.chaturx.leads");
  assert.equal(appJson.expo.ios.bundleIdentifier, "com.chaturx.leads");
  assert.equal(appJson.expo.version, "1.0.0");
  assert.doesNotMatch(JSON.stringify(appJson), /READ_MEDIA_IMAGES|CAMERA|RECORD_AUDIO|ACCESS_FINE_LOCATION/);
});

test("phase 30.1A documentation exists and is honest about iOS limits", () => {
  const doc = fs.readFileSync(path.join(root, "PHASE_30_1A_SCREEN_CAPTURE.md"), "utf8");
  assert.match(doc, /Website CRM/);
  assert.match(doc, /FLAG_SECURE/);
  assert.match(doc, /expo-screen-capture/);
  assert.match(doc, /not guaranteed|limitation/i);
  assert.match(doc, /Manual/);
  assert.match(doc, /Android/);
  assert.match(doc, /iOS/);
  assert.doesNotMatch(doc, /iOS screenshots are completely blocked/i);
});
