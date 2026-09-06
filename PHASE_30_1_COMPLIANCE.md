# Phase 30.1 — Android 16 + Account Deletion Compliance

Product: **Website CRM**  
Package / bundle: **com.chaturx.leads** (unchanged)  
Document date context: September 2026  
Status: audit + minimum compliance hardening (no production build, no store submit)

---

## 1. Current Google Play target SDK requirement

**Verified from Google Play Console Help — “Target API level requirements”**
(support.google.com/googleplay/android-developer/answer/11926878):

| Item | Requirement |
|---|---|
| Required target API | **Android 16 (API level 36)** |
| Effective date | **August 31, 2026** |
| New apps | Must target API **36** |
| App updates | Must target API **36** |
| Existing apps (discoverability) | Apps that do not target API **35+** may lose discoverability on newer devices |

**Does Website CRM’s first production release fall under this?**  
**Yes.** As of this phase date (after 31 Aug 2026), a new app submission and subsequent updates must target API 36.

Sources (authoritative; do not hardcode URLs in app source):

- Google Play Console Help: Target API level requirements
- Android Developers Blog: “Extend your app to support Android 16 and start targeting it for Google Play”

---

## 2. Actual Website CRM Android configuration

Managed Expo workflow (no checked-in `mobile/android/` native tree). Resolved from installed dependencies:

| Setting | Resolved value | Source |
|---|---|---|
| Expo SDK | **~57.0.20** | `mobile/package.json` |
| React Native | **0.86.3** | `mobile/package.json` |
| compileSdk | **36** | `react-native` `gradle/libs.versions.toml` + `expo-modules-core` Android defaults |
| targetSdk | **36** | same |
| minSdk | **24** | same |
| Android Gradle Plugin | **8.12.0** | RN `libs.versions.toml` |
| buildTools | **36.0.0** | RN `libs.versions.toml` |
| Kotlin | **2.1.20** | RN `libs.versions.toml` |
| NDK | **27.1.12297006** | RN `libs.versions.toml` |
| Package | **com.chaturx.leads** | `mobile/app.json` |
| versionName | **1.0.0** | `mobile/app.json` / Expo `version` |
| versionCode | **1** | `mobile/app.json` |

`npx expo config --type public` confirms package identity and plugins; SDK levels come from Expo/RN defaults at prebuild time (no override plugin installed).

### Compliance status

**TARGET SDK COMPLIANT**

No Expo/RN upgrade performed. No `expo-build-properties` dependency added (defaults already meet API 36).

---

## 3. Account deletion — Google Play rule (verified)

**Verified from Google Play Console Help — “Understanding Google Play’s app account deletion requirements”**
(support.google.com/googleplay/android-developer/answer/13327111)
and User Data policy (account deletion):

If the app allows account creation, developers must:

1. Provide an **in-app** path to delete the app account and associated user data; and
2. Provide a **public web resource** where users can **request** account/data deletion without needing to reinstall the app.

Additional policy points:

- Account **freezing / disabling alone is not** a valid substitute for deletion of associated user data.
- Certain data may be **retained for legitimate reasons** (security, fraud prevention, regulatory/business compliance) if users are clearly informed (e.g. privacy policy).
- The web resource may be a deletion flow, **customer-service email**, or request form — it must be functional, discoverable, and name the app/developer.
- Web resource does **not** require unauthenticated instant deletion of arbitrary accounts.

Website CRM also supports Apple’s expectation of in-app account deletion for apps with account creation (in-app path already present from Phase 29).

---

## 4. Actual deletion behavior (Phase 29 / unchanged core)

Implementation: `account-deletion.js` → authenticated `DELETE /api/account`.

| Data | Behavior |
|---|---|
| `app_users` row | **Retained** (anonymized in place) — hard delete would CASCADE-delete `lead_remarks` |
| name | → `Deleted User` |
| login_id | → unique `deleted_<id>_<stamp>` |
| password_hash | → unusable random hash |
| role | retained (authorization metadata; not used for login after deactivation) |
| is_active | → `0` |
| session_version | incremented |
| email on `app_users` | **N/A** (schema has no CRM email column) |
| project_user_assignments | **deleted** for that user |
| mobile_session_tokens | **deleted** |
| web `sessions` matching user | **destroyed** |
| lead_remarks | **retained** (author FK preserved; UI name becomes Deleted User) |
| lead_timeline_events | **retained** (actor may remain linked to anonymized user) |
| projects | **retained** |
| Google Sheets lead rows | **not touched** |
| Google `users` row / refresh token | **not touched** (shared admin Sheets auth; Disconnect is separate) |

Final active admin cannot self-delete (service continuity).

---

## 5. Personal vs business data classification

| DATA | PERSONAL ACCOUNT DATA? | BUSINESS/CRM DATA? | OWNER OF DATA | DELETE | ANONYMIZE | RETAIN | REASON |
|---|---|---|---|---|---|---|---|
| `app_users.name` | Yes | No | CRM user | — | Yes | Row kept | Remove PII; keep FK for remarks |
| `app_users.login_id` | Yes | No | CRM user | — | Yes | Row kept | Remove credential identifier |
| `app_users` email | N/A | — | — | — | — | — | Not in schema |
| `password_hash` | Yes (credential) | No | CRM user | — | Yes (replace) | — | Unusable; cannot sign in |
| `role` | Minimal | Operational | Operator | — | No | Yes | Not used for login when inactive |
| `is_active` / account status | Account state | — | Operator | — | Deactivate | Yes | Enforce deletion of access |
| `session_version` | Security | — | Operator | — | Bump | Yes | Invalidate auth |
| mobile/web sessions | Yes | No | CRM user | Yes | — | — | End access |
| project assignments | Yes (membership) | Also ops | Operator / user | Yes (for user) | — | — | Remove access mapping |
| remarks body | Possibly UGC | Yes (CRM) | Organization | No | Author display | Yes | Audit / lead history |
| timeline events | Possibly | Yes (CRM) | Organization | No | Actor display | Yes | Audit continuity |
| projects | No | Yes | Organization / Sheets admin | No | — | Yes | Shared business config; FK to Google `users` |
| Google `users` identity / email | Admin OAuth | Shared auth | Operator Sheets connection | No on CRM delete | — | Yes until Disconnect | Not the deleting user’s personal CRM login |
| Google refresh token | Credential | Shared | Operator | No on CRM delete | — | Until Disconnect | Shared; hard-delete of `users` would CASCADE projects |
| Google Sheets lead rows | Lead PII may exist | Yes | Spreadsheet / Google account owners | No | — | Yes | Outside CRM account; not owned as app-user personal vault |

---

## 6. External account deletion path

| Item | Value |
|---|---|
| Route | `/delete-account` |
| File | `public/delete-account.html` |
| Access | **Public** (no login to view) |
| Behavior | Instructions for in-app deletion + email **request** using placeholders `[PRIVACY CONTACT EMAIL]` / `[SUPPORT EMAIL]` |
| Does not | Allow unauthenticated wipe of arbitrary accounts |
| Owner action | Replace placeholders; enter this URL in Play Console Data deletion / Data Safety |

Play Console URL draft (confirm final domain):

`https://lead-admin-panel.vercel.app/delete-account`

---

## 7. Google authorization interaction

Account deletion **must not** clear shared Google credentials.

- Sheets connection is admin-scoped (`ADMIN_EMAIL` → `users` table).
- `projects.user_id` → `users.id` **ON DELETE CASCADE** — deleting the Google `users` row would destroy projects.
- Credential removal remains **`POST /api/google/disconnect`** (web admin).
- Account deletion flags: `preservedGoogleAuthorization: true`.

---

## 8. Permission audit

Intended surface: SecureStore, Linking, HTTPS networking.

`mobile/app.json` declares **no** CAMERA, mic, location, contacts, calendar, Bluetooth, POST_NOTIFICATIONS, foreground services, SMS, or phone permissions.

No permission-adding plugins are configured beyond Expo Router / SecureStore / SplashScreen.

---

## 9. Security audit (static)

Repo search for sensitive patterns distinguishes:

- Test placeholders / documentation mentions — acceptable
- Real credential files — must not be committed

Production mobile env carries only public `EXPO_PUBLIC_*` HTTPS URLs (no localhost in production profile).

Account deletion API: authenticated identity only; no client-supplied `user_id`; CSRF for browser; bearer for mobile.

---

## 10. Privacy / Terms consistency

- Privacy Policy updated to describe irreversible de-identification, retained business records, `/delete-account`, and Google Disconnect.
- Terms updated to reference `/delete-account`.
- Placeholders preserved (no invented emails).

---

## 11. Store readiness notes

### Apple App Privacy (factual prep — not submitted)

Relevant categories supported by code:

- Contact info (lead sheet fields; not CRM login email)
- Identifiers / account (login ID, name, role)
- User content (remarks)
- Customer / lead info (Sheets)
- Google account info (admin connection)
- Authentication (password hash, sessions)

Not claimed: tracking, advertising, analytics SDKs, precise location, contacts book, photos, mic.

### Google Play Data Safety (factual draft — not submitted)

| Topic | Draft |
|---|---|
| Collection | Account metadata, sessions, CRM remarks/timeline, Sheets-backed leads, encrypted Google refresh token (admin) |
| Sharing | Google APIs when Sheets connected; hosting/DB providers |
| Security | HTTPS production; hashed passwords; encrypted refresh tokens |
| Deletion | In-app + `/delete-account` request page; personal account de-identified; business records retained as disclosed |
| Account deletion URL | `/delete-account` |
| Tracking/ads | No |

Uncertain console wording: **OWNER INPUT REQUIRED**

---

## 12. Remaining owner inputs

- Replace legal placeholders (`[LEGAL BUSINESS NAME]`, `[PRIVACY CONTACT EMAIL]`, `[SUPPORT EMAIL]`, `[EFFECTIVE DATE]`, address)
- Confirm production public domain
- Enter Privacy + Delete Account URLs in store consoles
- Complete Apple App Privacy + Play Data Safety forms
- EAS signing / store accounts (project already linked: `@sainiankush16s-team/chaturx`)
- Reviewer credentials

## 13. Blockers

**None for target SDK** — Expo 57 / RN 0.86 already resolve to API 36.

**None for account deletion design** — Phase 29 anonymization + new public `/delete-account` satisfy Play’s in-app + web request requirements when placeholders are filled and URLs registered.

Production IPA/AAB generation remains intentionally **out of scope** for this phase.
