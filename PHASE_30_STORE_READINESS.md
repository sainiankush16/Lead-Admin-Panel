# Phase 30 — Store Readiness

Product: **Website CRM**  
Package / bundle identity: **com.chaturx.leads** (preserved)  
App version: **1.0.0**  
iOS buildNumber: **1**  
Android versionCode: **1**  
Document type: production-build / store readiness checklist (not a legal opinion; not a store submission)

Known production public host (confirm before submission):

`https://lead-admin-panel.vercel.app`

---

## Expo / EAS snapshot

| Item | Value |
|---|---|
| Expo SDK | ~57 |
| React Native | 0.86.3 |
| Expo Router | ~57 |
| TypeScript | ~5.9 |
| Visible name | Website CRM |
| Slug | `chaturx` |
| Scheme | `chaturx` |
| Icon | `mobile/assets/images/icon.png` (1024×1024) |
| Splash | `mobile/assets/images/splash-icon.png` |
| EAS config | `mobile/eas.json` (development / preview / production) |
| EAS project link | **LINKED** — `@sainiankush16s-team/chaturx` (`371610cf-f7db-4582-a68f-bf5ae57741cd`) |
| Expo Updates / OTA | Not configured (not required for first release) |

Production EAS profile sets public env only:

- `EXPO_PUBLIC_API_BASE_URL=https://lead-admin-panel.vercel.app`
- `EXPO_PUBLIC_LEGAL_BASE_URL=https://lead-admin-panel.vercel.app`

No server secrets are placed in mobile or EAS env.

---

## Draft store description (factual)

**App name:** Website CRM

**Short description:**  
Secure lead management CRM for authorized teams working Google Sheets–backed projects.

**Full description (draft):**  
Website CRM helps authorized sales and operations teams manage leads across projects. Sign in with your Website CRM login ID and password to access your dashboard, projects, lead lists, search, status updates, remarks, and timeline history. Administrators can manage users, project assignments, and the Google Sheets connection used for spreadsheet-backed lead data.

Features include dashboard summaries, pipeline and productivity overviews, an action center for daily follow-up work, bulk lead status updates, contact actions (call, WhatsApp, email via the device), and account settings with Privacy Policy, Terms of Use, and account deletion.

Website CRM does not provide AI scoring, predictive conversion guarantees, push notifications, automated messaging, or advertising tracking.

**Category suggestion:** Business (or Productivity, owner choice)

**Support URL / email:** OWNER INPUT REQUIRED  
**Privacy Policy:** `https://lead-admin-panel.vercel.app/privacy` (confirm final domain)  
**Account deletion (web):** `https://lead-admin-panel.vercel.app/delete-account` (confirm final domain)  
**Terms:** `https://lead-admin-panel.vercel.app/terms` (confirm final domain)

---

## Apple App Privacy — factual draft matrix

| Data category | Processed? | Source | Purpose | Stored where | Linked to user? | Tracking? | Shared? | Deletion |
|---|---|---|---|---|---|---|---|---|
| Name | Yes | Account / lead sheets | Account UI / CRM | `app_users` / Sheets | Yes (account); lead names are business data | No | Hosting/DB; Google Sheets | Account anonymized; sheet rows owner-controlled |
| Email | Lead sheets; Google connection email | Sheets / Google OAuth admin connection | CRM / Sheets auth status | Sheets; `users` | Google connection email yes | No | Google | Disconnect clears token; sheet data owner-controlled |
| Phone | Lead sheets | Sheets | Contact actions | Sheets | Lead data | No | Google | Sheet owner-controlled |
| User ID / Login ID | Yes | Account | Auth | `app_users` | Yes | No | Hosting/DB | Anonymized on account deletion |
| Password | Transit at login only | User | Auth | Argon2id hash server-side | Yes | No | No | Hash replaced on deletion |
| Customer info (leads) | Yes | Google Sheets | CRM | Sheets + remarks/timeline | Organization/project | No | Google | Not deleted by account deletion |
| User content (remarks) | Yes | In-app | Notes | DB | Author linked (de-identified after deletion) | No | Hosting/DB | Retained for audit with de-identified author |
| Other usage data (timeline) | Yes | Server events | Audit | DB | Actor may be linked | No | Hosting/DB | Retained; actor may null/de-identify |
| Device ID / Advertising ID | No | — | — | — | — | — | — | — |
| Precise location / contacts / photos / mic | No | — | — | — | — | — | — | — |
| Diagnostics / analytics SDK | No | — | — | — | — | — | — | — |

Final App Store Connect questionnaire answers: **OWNER INPUT REQUIRED**

---

## Google Play Data Safety — factual draft

| Topic | Draft answer from code |
|---|---|
| Data collected | Account credentials metadata, session tokens, lead/CRM data, remarks/timeline, admin Google OAuth metadata/token (encrypted server-side) |
| Data shared | With Google APIs for Sheets/Drive when connected; with hosting/DB providers operating the service |
| Encrypted in transit | Yes (HTTPS production) |
| Encrypted at rest | Password hashes; Google refresh tokens encrypted; DB host encryption depends on Turso/operator |
| Users can request deletion | Yes — in-app Delete Account (mobile); public `/delete-account` request page; Google disconnect for Sheets auth |
| Data deletion | Account anonymization + session invalidation; Sheets/projects/remarks/timeline not auto-deleted (disclosed) |
| Account deletion URL | `https://lead-admin-panel.vercel.app/delete-account` (confirm domain) |
| Tracking / ads | Not used |
| Optional vs required | Account required to use app; lead fields depend on connected sheets |

Final Play Console Data Safety form: **OWNER INPUT REQUIRED**

---

## Apple App Store checklist

| Item | Status |
|---|---|
| Visible app name Website CRM | IMPLEMENTED |
| Bundle ID `com.chaturx.leads` | IMPLEMENTED |
| Version / buildNumber | IMPLEMENTED (`1.0.0` / `1`) |
| Privacy Policy URL (public) | PARTIALLY IMPLEMENTED (route live; confirm domain + placeholders) |
| In-app Privacy / Terms links | IMPLEMENTED |
| Account deletion | IMPLEMENTED |
| Google disconnect (web admin) | IMPLEMENTED |
| Icon 1024×1024 | IMPLEMENTED (asset present) |
| EAS production iOS profile | IMPLEMENTED (config only) |
| Apple Developer / App Store Connect | OWNER INPUT REQUIRED |
| Screenshots / description / keywords | OWNER INPUT REQUIRED |
| Support URL | OWNER INPUT REQUIRED |
| App Privacy form submission | OWNER INPUT REQUIRED |
| Age rating questionnaire | OWNER INPUT REQUIRED |
| TestFlight / reviewer credentials | OWNER INPUT REQUIRED |
| Actual IPA upload / submission | NOT DONE (by design) |

## Google Play checklist

| Item | Status |
|---|---|
| App name Website CRM | IMPLEMENTED |
| Package `com.chaturx.leads` | IMPLEMENTED |
| versionName / versionCode | IMPLEMENTED (`1.0.0` / `1`) |
| Privacy Policy URL | PARTIALLY IMPLEMENTED |
| Account deletion (in-app) | IMPLEMENTED |
| Account deletion (web `/delete-account`) | IMPLEMENTED (placeholders for contact email) |
| Data Safety draft | PREPARED (console entry OWNER INPUT) |
| EAS production AAB profile | IMPLEMENTED (config only) |
| Adaptive icon assets | IMPLEMENTED |
| Play Console / signing / tracks | OWNER INPUT REQUIRED |
| Feature graphic / screenshots | OWNER INPUT REQUIRED |
| Content rating | OWNER INPUT REQUIRED |
| Target SDK (API 36 / Android 16) | **COMPLIANT** — Expo 57 / RN 0.86 resolve compileSdk+targetSdk **36** (see PHASE_30_1_COMPLIANCE.md) |
| Actual AAB upload / production publish | NOT DONE (by design) |

---

## Store assets

| Asset | Status |
|---|---|
| App icon 1024×1024 | Present |
| Android adaptive icons | Present |
| Splash | Present |
| iPhone screenshots | OWNER INPUT REQUIRED |
| iPad screenshots (if claiming iPad) | OWNER INPUT REQUIRED (`supportsTablet: true`) |
| Play feature graphic | OWNER INPUT REQUIRED |
| Phone / tablet screenshots (Play) | OWNER INPUT REQUIRED |

---

## Reviewer access

Website CRM requires Login ID + Password.

Provide a non-production or dedicated reviewer account through store review notes.

**Do not commit passwords.**  
**OWNER INPUT REQUIRED** for final reviewer credentials and access instructions.

---

## Content / age rating notes

Website CRM is a business lead-management tool for authorized organization users. It is not a social network, game, gambling product, or adult content app. Final questionnaire answers remain OWNER INPUT REQUIRED.

---

## Owner input required before submission

### Legal
- Legal business / operator name
- Privacy contact email
- Support email / support URL
- Business address (if required)
- Privacy/Terms effective date
- Confirm final public/legal domain

### Apple
- Apple Developer Program membership
- App Store Connect app record
- Screenshots + metadata
- App Privacy answers
- Reviewer credentials
- TestFlight process

### Google
- Play Console account
- Screenshots + feature graphic
- Data Safety answers
- Content rating
- Signing / Play App Signing
- Testing track + reviewer/app-access instructions

### Build / EAS
- Expo/EAS account: **linked** — `@sainiankush16s-team/chaturx` (`371610cf-f7db-4582-a68f-bf5ae57741cd`)
- Apple/Google credentials in EAS (signing) — OWNER ACTION REQUIRED
- Owner-run production builds — later phase
- Confirm target SDK / store requirements at build time

### Backend / Vercel (operator verify)
- `NODE_ENV=production`
- HTTPS `BASE_URL`
- Production `GOOGLE_REDIRECT_URI`
- Turso configured
- Trust proxy on Vercel
- `/privacy`, `/terms`, and `/delete-account` reachable publicly

---

## Explicit non-claims

- No production IPA/AAB was generated by this phase unless the owner later runs EAS builds.
- Store compliance is not complete until store-side forms and assets are finished.
- No analytics, ads, push, or background execution were added.
- Package identity `com.chaturx.leads` was preserved deliberately.
