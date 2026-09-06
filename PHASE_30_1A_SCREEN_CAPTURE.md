# Phase 30.1A — Screen Capture & Recent-App Privacy Protection

Product: **Website CRM**  
Package / bundle: **com.chaturx.leads** (unchanged)  
Stack: Expo SDK **57**, React Native **0.86.3**, Expo Router (managed / CNG — no checked-in `android/` / `ios/`)

---

## Objective

Reduce exposure of CRM lead/customer information (names, phones, emails, remarks, timelines, projects, users) through screenshots, screen recording/mirroring where the OS supports protection, and recent-app / app-switcher previews.

Protection applies to the **authenticated CRM workspace** only (single wrapper at `mobile/app/(app)/_layout.tsx`).  
Login and public legal HTML pages (`/privacy`, `/terms`, `/delete-account`) are not wrapped.

---

## Dependency

| Item | Value |
|---|---|
| Package | `expo-screen-capture` |
| Version | `~57.0.2` (Expo SDK 57 compatible; installed via `npx expo install`) |
| Why required | Official Expo native module; Android `FLAG_SECURE` and iOS capture/app-switcher APIs are not available from JS alone |
| Config plugin | Not required (autolinking) |
| Production builds | Included automatically on EAS prebuild; no extra permissions declared |
| Expo / RN upgrade | **None** |

This is a first-party Expo module for SDK 57, not an unrelated third-party capture SDK.

---

## Android implementation

Via `ScreenCapture.preventScreenCaptureAsync('website-crm-authenticated')`:

| Concern | Behavior |
|---|---|
| Screenshots | Blocked (`WindowManager.LayoutParams.FLAG_SECURE`) |
| Screen recording / media projection capture | Blocked / blanked by the same secure window flag |
| Recent-app / app-switcher preview | Blank / non-content preview (FLAG_SECURE) |

No `READ_MEDIA_IMAGES` / storage permissions were added. Screenshot *listeners* are intentionally unused (they would need media permissions on older Android and only fire after a capture).

---

## iOS implementation

Via the same `preventScreenCaptureAsync` plus `enableAppSwitcherProtectionAsync(0.75)` while authenticated:

| Concern | Behavior |
|---|---|
| Screen recording / mirroring | When `UIScreen.isCaptured` is true, Expo overlays a full black privacy view over the window |
| App switcher / background | Blur privacy overlay while inactive / interrupted |
| Ordinary screenshots | Expo applies a secure `UITextField` layer technique intended to blank sensitive content in snapshots |

### Important limitation (honest)

**Ordinary iOS screenshots are not guaranteed to be absolutely preventable** on every device/OS configuration. Apple does not provide a universal public “FLAG_SECURE equivalent” with the same absolute semantics as Android. Website CRM uses Expo ScreenCapture’s strongest supported protections and **must not** claim absolute iOS screenshot impossibility.

Additional JS `AppState` overlay (`Website CRM` / `Content hidden`) covers inactive/background as a lifecycle backup and is removed when the app returns to `active`.

---

## Recent-app privacy

- **Android:** Covered by FLAG_SECURE (blank preview).
- **iOS:** `enableAppSwitcherProtectionAsync` + JS lifecycle overlay backup.

---

## Affected screens (authenticated)

All routes under `(app)/`:

- Dashboard, Projects, Lead list, Lead detail, Search, Remarks, Timeline, Users, Project management, More / Account settings

Unaffected:

- Login
- Public Privacy / Terms / Delete Account web pages (opened via browser Linking)

Users cannot disable protection inside the CRM.

---

## Security / UX notes

- No change to auth, SecureStore, CSRF, account deletion, or Google OAuth/disconnect
- No analytics/telemetry on capture events
- No screenshot storage or upload
- No new camera/mic/location/contacts/calendar/Bluetooth/notification permissions
- Overlay is silent during normal active use; appears only for lifecycle privacy (JS) or native capture (iOS recording)

---

## Automated tests

`screen-capture-protection-mobile.test.js` covers:

- Authenticated vs unauthenticated gating logic
- Lifecycle overlay state transitions and listener cleanup counters
- Overlay copy branding
- Platform capability summary honesty
- `(app)/_layout` wrap vs login/root/legal pages
- Dependency + package identity + no media permissions

Native physical screenshot/recording blocking is **not** asserted in unit tests.

---

## Manual device test plan

### Android

1. Login  
2. Open Dashboard — attempt screenshot (expect blocked / empty)  
3. Attempt screen recording (expect CRM UI not captured)  
4. Open recent apps — expect blank/non-CRM preview  
5. Navigate Projects → Lead List → Lead Detail — protection remains  
6. Search, Remarks, Timeline  
7. Users / Project Management (admin)  
8. Logout — login usable  
9. Open Privacy/Terms/Delete Account in browser — usable  

### iOS

1. Login  
2. Open Dashboard — start screen recording/mirroring if available — expect content obscured  
3. Stop capture — content returns  
4. App switcher / background — expect blur / privacy overlay (no lead data)  
5. Lead Detail, Search, Remarks, Timeline, Users, Project Management  
6. Logout  
7. Public legal pages remain usable  
8. Note: ordinary screenshot may not be absolutely preventable; verify best-effort secure-layer behavior on the target OS version  

---

## Production-build considerations

- Managed workflow: protection is applied at runtime after EAS generates native projects with autolinked `expo-screen-capture`
- Verify on a **device build** (dev client or production), not only Expo Go if behavior differs
- Package `com.chaturx.leads`, name **Website CRM**, version **1.0.0** unchanged
- No IPA/AAB generated in this phase

---

## Files

| Path | Role |
|---|---|
| `mobile/utils/screenCaptureProtectionCore.js` | Pure logic |
| `mobile/components/ScreenCaptureProtection.tsx` | Native + lifecycle wrapper |
| `mobile/app/(app)/_layout.tsx` | Authenticated root wrap |
| `screen-capture-protection-mobile.test.js` | Automated tests |
| `PHASE_30_1A_SCREEN_CAPTURE.md` | This document |
