# Phase 30.2 — EAS Production Readiness

Product: **Website CRM**  
Package / bundle: **com.chaturx.leads**  
Document type: EAS production configuration / readiness audit (not a store submission; not a build run)

---

## Status

**Partial — EAS project linked and verified; signing, store setup, and production builds remain owner actions.**

Repo-side production EAS profiles, public URLs, identity, API 36 defaults, screen-capture, auth, account-deletion readiness, and EAS project linking are in place.  
No IPA/AAB was generated. Signing credentials and store submission remain **OWNER ACTION REQUIRED**.

---

## App Identity

| Item | Value | Status |
|---|---|---|
| Visible name | Website CRM | VERIFIED |
| Slug | `chaturx` | VERIFIED (internal Expo slug; not the product display name) |
| Owner | `sainiankush16s-team` | VERIFIED |
| Scheme | `chaturx` | VERIFIED |
| Android package | `com.chaturx.leads` | VERIFIED |
| iOS bundle ID | `com.chaturx.leads` | VERIFIED |
| Version | `1.0.0` | VERIFIED |
| Android versionCode | `1` | VERIFIED |
| iOS buildNumber | `1` | VERIFIED |
| Icon | `mobile/assets/images/icon.png` | VERIFIED present |
| Splash | `mobile/assets/images/splash-icon.png` | VERIFIED present |
| Adaptive icons | Android adaptive set in `app.json` | VERIFIED |

Version/build numbers were **not** incremented in this phase. Increment before a subsequent store upload if a prior binary already used `1` / `1`.

---

## EAS Project

| Item | Value / Status |
|---|---|
| EAS project | `@sainiankush16s-team/chaturx` |
| Project ID | `371610cf-f7db-4582-a68f-bf5ae57741cd` |
| Owner | `sainiankush16s-team` |
| Link status | **LINKED AND VERIFIED** |
| `extra.eas.projectId` in `app.json` | **Present** — matches Project ID above |
| `owner` in `app.json` | `sainiankush16s-team` |
| Checked-in `android/` / `ios/` | Absent (managed / CNG) |
| EAS CLI | `eas-cli/23.2.0` runnable via `npx` |

### VERIFIED

- Expo authentication succeeded (owner-side)
- EAS project was created: `@sainiankush16s-team/chaturx`
- EAS project is linked in this repo
- `extra.eas.projectId` is present and correct
- Do **not** create another EAS project; do **not** change slug `chaturx`

### OWNER ACTION REQUIRED (remaining)

- Android / iOS signing credentials if not yet configured (do not claim complete until verified)
- Apple Developer / Google Play Console setup
- Legal/contact placeholders
- Screenshots / store assets
- Reviewer account (credentials out-of-band)
- Actual production `eas build` / submit in a later approved phase

Do not create duplicate EAS projects.

---

## EAS Profiles

File: `mobile/eas.json`

| Profile | Purpose | Status |
|---|---|---|
| `development` | Dev client, internal, iOS simulator | VERIFIED |
| `preview` | Internal distribution; Android APK | VERIFIED |
| `production` | `distribution: "store"`; Android `app-bundle` (AAB); production public env | VERIFIED / clarified in Phase 30.2 |

Production `env` (public only):

- `EXPO_PUBLIC_API_BASE_URL=https://lead-admin-panel.vercel.app`
- `EXPO_PUBLIC_LEGAL_BASE_URL=https://lead-admin-panel.vercel.app`

No named EAS Environment secrets are required for the mobile client.  
No server secrets in `eas.json`.

`submit.production` exists as an empty placeholder for a **future** owner-run submit (not executed).

---

## Production Environment

| Concern | Result |
|---|---|
| Production API host | `https://lead-admin-panel.vercel.app` |
| Production legal host | `https://lead-admin-panel.vercel.app` |
| Localhost in production profile | **None** |
| `__DEV__` localhost fallback | Development only (`mobile/lib/config.ts`) |
| Non-dev fallback | Production HTTPS host (not LAN) |
| Client secrets in `EXPO_PUBLIC_*` | **None found** |

Server secrets remain root `.env` / Vercel only (`SESSION_SECRET`, `TOKEN_ENCRYPTION_KEY`, Turso, Google client secret, etc.) — never mobile.

---

## Android Build

| Item | Value | Status |
|---|---|---|
| compileSdk | 36 | VERIFIED (RN 0.86 / Expo 57 defaults) |
| targetSdk | 36 | VERIFIED |
| minSdk | 24 | VERIFIED |
| Production artifact type | AAB (`app-bundle`) | VERIFIED in `eas.json` |
| Screen capture | `expo-screen-capture` → FLAG_SECURE | VERIFIED intact |
| Unexpected permissions (camera/mic/location/contacts/calendar/BT/notifications/SMS/phone) | Not declared in `app.json` | VERIFIED |
| AAB generation this phase | **NOT GENERATED** | By design |

---

## iOS Build

| Item | Value | Status |
|---|---|---|
| Bundle ID | `com.chaturx.leads` | VERIFIED |
| Distribution (production) | `store` | VERIFIED in `eas.json` |
| Camera/mic/location/contacts/calendar/BT/push/background modes | Not added | VERIFIED |
| Screen capture / app-switcher privacy | Phase 30.1A intact | VERIFIED |
| IPA generation this phase | **NOT GENERATED** | By design |

iOS ordinary screenshots remain a **platform limitation** (best-effort via Expo ScreenCapture); documented in `PHASE_30_1A_SCREEN_CAPTURE.md`.

---

## Signing & Credentials

| Platform | Status |
|---|---|
| Android EAS-managed keystore / owner keystore | **OWNER ACTION REQUIRED** — not claimed complete in this phase |
| iOS Apple team / distribution certs / provisioning | **OWNER ACTION REQUIRED** — Apple account + EAS credentials |
| Credentials printed in report | **None** (none retrieved) |

Do not invent or paste certificates, keystores, or passwords into the repo.

---

## Permissions & Capabilities

**IMPLEMENTED / VERIFIED:** Minimal surface (SecureStore, Linking, HTTPS networking, screen-capture native module). Call / WhatsApp / Email via Linking without CALL_PHONE / SMS permissions.

**Not added:** push, camera, microphone, location, contacts, calendar, Bluetooth, foreground services.

---

## Screen Capture Protection

**VERIFIED intact (Phase 30.1A):**

- Authenticated `(app)` layout wraps `ScreenCaptureProtection`
- Dependency `expo-screen-capture@~57.0.2`
- Android FLAG_SECURE path
- iOS capture + app-switcher blur + lifecycle overlay
- Login / public legal HTML not wrapped

---

## Authentication

**VERIFIED unchanged:** Login ID + password → mobile bearer token in SecureStore → backend authorization. No Google login in the mobile app. Google OAuth remains Sheets admin connection on the backend.

---

## Account Deletion

**VERIFIED available (unchanged logic):**

| Path | Status |
|---|---|
| In-app `DELETE /api/account` + confirmation | VERIFIED wired |
| Public `/delete-account` | VERIFIED |
| Session / mobile token invalidation | VERIFIED by Phase 29 design |
| Personal de-identification | VERIFIED |
| Final admin protection | VERIFIED |
| Shared Google auth via Disconnect (not account delete) | VERIFIED |
| Legal placeholders on deletion/privacy pages | Still placeholders — **OWNER ACTION REQUIRED** to replace before submission |

---

## Privacy & Legal URLs

| URL | Status |
|---|---|
| `https://lead-admin-panel.vercel.app/privacy` | Configured / route exists |
| `https://lead-admin-panel.vercel.app/terms` | Configured / route exists |
| `https://lead-admin-panel.vercel.app/delete-account` | Configured / route exists |

Placeholders remaining (do not invent values):

- `[LEGAL BUSINESS NAME]`
- `[PRIVACY CONTACT EMAIL]`
- `[SUPPORT EMAIL]`
- `[EFFECTIVE DATE]`
- `[BUSINESS ADDRESS]` (if used)

---

## Store Readiness

### Apple — OWNER ACTION REQUIRED (not submitted)

- Apple Developer + EAS Apple credentials  
- App Store Connect app record  
- Privacy Policy URL (after placeholders filled)  
- App Privacy questionnaire  
- Account deletion disclosure  
- Screenshots / metadata / category / age rating  
- Support URL/email  
- Dedicated reviewer Login ID (minimum-privilege Project User preferred) — **password never in Git/docs**  
- Reviewer notes  

### Google Play — OWNER ACTION REQUIRED (not submitted)

- Play Console app  
- Production AAB (future phase)  
- Target API 36 (config already compliant)  
- Privacy Policy URL + account deletion URL (`/delete-account`)  
- Data Safety form  
- Content rating  
- Screenshots / feature graphic / description  
- Support/contact  
- Reviewer access (same credential rule as Apple)  

See also `PHASE_30_STORE_READINESS.md`.

---

## Validation Results

| Check | Result |
|---|---|
| `npx expo config --type public` | Pass — Website CRM / `com.chaturx.leads` / 1.0.0 / SDK 57 / owner + projectId present |
| `npx expo-doctor` | **19/21 passed**; 2 advisories (see below) — **no dependency upgrades applied** (phase rule) |
| `npx eas-cli --version` | `eas-cli/23.2.0` |
| `npx eas project:info` | **Pass** — `@sainiankush16s-team/chaturx` / `371610cf-f7db-4582-a68f-bf5ae57741cd` |
| Root `npm test` | **356 pass** |
| Mobile `npm test` | **226 pass** |
| `npx tsc --noEmit` | Pass |
| Root `npm run lint` | Pass |
| Root `npm audit --omit=dev` | 0 vulnerabilities |
| Mobile `npm audit --omit=dev` | 14 moderate (Expo transitive); no `npm audit fix` |

### Expo Doctor advisories (not fixed in this phase)

1. Schema warning: `newArchEnabled` flagged as additional property in `app.json` (pre-existing Expo new-architecture flag; left unchanged).
2. Version skew reported: `expo-secure-store` expected `~57.0.3` vs installed `~15.0.x` lineage for this SDK packaging, and TypeScript expected `~6.0.3` vs `~5.9.2`. **No `expo install --fix` / upgrades** per Phase 30.2 rules; re-evaluate only if a future production build fails.

---

## Owner Actions Required

1. Configure Android signing (EAS-managed or upload keystore) — never commit keystore secrets  
2. Connect Apple Developer / App Store distribution credentials in EAS  
3. Replace legal placeholders on `/privacy`, `/terms`, `/delete-account`  
4. Confirm production domain remains `https://lead-admin-panel.vercel.app` (or update URLs deliberately)  
5. Create a dedicated reviewer Project User (credentials out-of-band only)  
6. Complete store listings, screenshots, Data Safety / App Privacy forms  
7. Run production `eas build` only in a later approved phase  

EAS project create/link is **done** — do not create another project.
---

## Build Status

IPA: **NOT GENERATED**  
AAB: **NOT GENERATED**  
`eas build` / `eas submit`: **NOT RUN**
