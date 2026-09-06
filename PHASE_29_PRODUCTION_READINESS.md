# Phase 29 — Production Readiness + Privacy Foundation

Product name: **Website CRM**  
Package / bundle identity (preserved): `com.chaturx.leads`  
Document status: developer checklist (not a legal opinion)

---

## Privacy data inventory (factual)

| Category | Collected? | Source | Storage | Purpose | Access | Shared? | Leaves device? | Retention / deletion |
|---|---|---|---|---|---|---|---|---|
| Login ID, name, role, active flag | Yes | Admin-created accounts / login | `app_users` (Turso/SQLite) | AuthZ / account UI | Admins; self (limited) | Hosting/DB provider | Yes (API) | Anonymized on account deletion |
| Password | Yes (plaintext only in transit at login) | User entry | Argon2id `password_hash` only | Authentication | Server only | No | Hash only on server | Hash replaced with unusable value on deletion |
| Web session / CSRF | Yes | Server-issued | `sessions` store | Browser auth | Server | Hosting/DB | Cookie to browser | Destroyed on logout / deletion / version bump |
| Mobile session token | Yes | Server-issued | SecureStore (device) + hashed in `mobile_session_tokens` | Mobile auth | Device + server hash | No SDK share | Token to API | Cleared locally; hashes deleted server-side |
| Lead fields (name/phone/email/status/etc.) | Yes | Connected Google Sheets | Sheets + transient API responses | CRM operations | Authorized project users/admins | Google | Yes | Controlled by Sheets owners; not deleted by account deletion |
| Remarks | Yes | Users in-app | `lead_remarks` | Operational notes | Project-authorized users | Hosting/DB | Yes | Kept with de-identified author after account deletion |
| Timeline events | Yes | Server on status/etc. | `lead_timeline_events` | Audit history | Project-authorized users | Hosting/DB | Yes | Actor may remain / null; not wiped by account deletion |
| Google OAuth profile + encrypted refresh token | Yes (admin Sheets connection) | Google OAuth | `users.refresh_token_enc` etc. | Sheets/Drive API | Admins / server | Google APIs | Yes | Cleared by explicit admin Disconnect Google; retained (intentionally) on CRM account deletion because connection is shared and not bound to `app_users` |
| Project config / spreadsheet IDs | Yes | Admin setup | `projects` | Project binding | Admins + assigned users | Hosting/DB | Yes | Until admin deletes project |
| Analytics / ads / push / location / contacts / camera / mic | **No** | — | — | — | — | — | — | Not present in codebase |

---

## Legal URLs

| Item | Value |
|---|---|
| Privacy Policy | `{LEGAL_BASE}/privacy` |
| Terms of Use | `{LEGAL_BASE}/terms` |
| Default production legal host | `https://lead-admin-panel.vercel.app` |
| Mobile config | `EXPO_PUBLIC_LEGAL_BASE_URL` (preferred) or non-localhost API base |

Owner must replace placeholders inside the HTML pages:

- `[LEGAL BUSINESS NAME]`
- `[PRIVACY CONTACT EMAIL]`
- `[SUPPORT EMAIL]`
- `[BUSINESS ADDRESS]`
- `[EFFECTIVE DATE]`

---

## Account deletion behavior

| Behavior | Status |
|---|---|
| Mobile More → Delete Account with confirmation | IMPLEMENTED |
| `DELETE /api/account` with `{ "confirm": "DELETE" }` | IMPLEMENTED |
| Auth derived from session/bearer (not client user id) | IMPLEMENTED |
| CSRF for browser; bearer CSRF bypass unchanged | IMPLEMENTED |
| Anonymize `app_users`; deactivate; bump `session_version` | IMPLEMENTED |
| Remove project assignments | IMPLEMENTED |
| Invalidate mobile tokens + matching web sessions | IMPLEMENTED |
| Preserve remarks (avoid CASCADE wipe) | IMPLEMENTED |
| Do not delete Sheets / projects / Google connection on account deletion | IMPLEMENTED |
| Block deletion of final active admin | IMPLEMENTED |
| Dedicated Google disconnect/revoke UI/API | **IMPLEMENTED** (`POST /api/google/disconnect`, web admin UI) |
| Mobile Google disconnect UI | **NOT APPLICABLE** (web-admin-only; mobile only shows connection status for project create) |

---

## Google disconnect (Phase 29.1)

| Item | Behavior |
|---|---|
| Endpoint | `POST /api/google/disconnect` |
| Auth | Admin-only + CSRF (browser) / existing bearer CSRF rules |
| Revocation | Server attempts Google `revokeToken`; never returns token |
| Local storage | Always clears `users.refresh_token_enc` (identity row retained) |
| Why retain row | `projects.user_id` FK → `users.id` ON DELETE CASCADE |
| Idempotent | Already disconnected → safe success |
| Account deletion interaction | CRM account deletion does **not** clear shared Google credentials |

---

## Apple App Store checklist

| Item | Status |
|---|---|
| Privacy Policy URL | PARTIALLY IMPLEMENTED (route live; owner must publish final domain + replace placeholders) |
| In-app Privacy Policy link | IMPLEMENTED |
| Terms link | IMPLEMENTED |
| Account deletion | IMPLEMENTED |
| Google disconnect | IMPLEMENTED (web admin) |
| App Privacy questionnaire | OWNER INPUT REQUIRED |
| Data collection declarations | OWNER INPUT REQUIRED (use inventory above) |
| Permissions justification | IMPLEMENTED / NOT APPLICABLE (no camera/location/contacts/push requested in config) |
| App description / screenshots / icon | OWNER INPUT REQUIRED |
| Support URL | OWNER INPUT REQUIRED |
| Marketing URL | OWNER INPUT REQUIRED |
| Bundle ID `com.chaturx.leads` | IMPLEMENTED (preserved) |
| Visible name Website CRM | IMPLEMENTED (`app.json` name) |
| Version / build | PARTIALLY IMPLEMENTED (`1.0.0`; store build numbers OWNER INPUT) |
| TestFlight + reviewer credentials | OWNER INPUT REQUIRED |

## Google Play checklist

| Item | Status |
|---|---|
| Privacy Policy URL | PARTIALLY IMPLEMENTED |
| Data Safety form | OWNER INPUT REQUIRED |
| Account deletion | IMPLEMENTED |
| Google disconnect | IMPLEMENTED (web admin) |
| Target SDK / release build | OWNER INPUT REQUIRED (EAS/store pipeline) |
| App access / reviewer credentials | OWNER INPUT REQUIRED |
| Screenshots / icon / listing | OWNER INPUT REQUIRED |
| Package `com.chaturx.leads` | IMPLEMENTED (preserved) |
| Internal/closed/production tracks | OWNER INPUT REQUIRED |

---

## Google OAuth privacy notes

Scopes in `google.js`:

- `openid`, `email`, `profile`
- `https://www.googleapis.com/auth/spreadsheets`
- `https://www.googleapis.com/auth/drive.readonly`

Purpose: authorize Sheets read/update and Drive spreadsheet listing for admin-connected projects.  
Refresh tokens encrypted with `TOKEN_ENCRYPTION_KEY`. Tokens are not returned to mobile clients.  
No Google login for normal CRM users.  
Connection lookup uses `ADMIN_EMAIL` against the `users` table (shared, not per `app_users` row).  
**Disconnect:** admins use web **Disconnect Google** → `POST /api/google/disconnect` which revokes when possible and clears encrypted refresh tokens locally without deleting projects, sheets, remarks, timeline, or CRM accounts.  
**Account deletion:** does not disconnect Google, because remaining administrators still require the shared Sheets authorization.

---

## Permissions / native capabilities

| Capability | Present? | Required? |
|---|---|---|
| SecureStore (session token) | Yes | Yes |
| Linking (tel/mailto/https/WhatsApp) | Yes | Yes |
| Camera / Photos / Mic / Location / Contacts / Calendar / Bluetooth / Push | No | No |
| Analytics / Ads / Crash SDKs | No | No |

---

## Store data classification draft

| Data type | Collected | Linked to user | Purpose | Required | Shared third party | Retention |
|---|---|---|---|---|---|---|
| Name | Yes | Yes | Account | Required for accounts | Hosting/DB | Until deletion anonymization |
| Email | Google connection email only (admin Sheets) | Yes (Google user row) | Sheets auth status | Optional for CRM login users | Google | Until Google connection changed |
| Phone | Lead sheet fields | Lead, not always CRM user | CRM | Optional | Google Sheets | Sheets-controlled |
| User ID / Login ID | Yes | Yes | Auth | Required | Hosting/DB | Anonymized on deletion |
| Photos / precise location / contacts / ads ID | No | — | — | — | — | — |
| Customer info (leads) | Yes | Organization projects | CRM | Product function | Google | Sheets + CRM remarks/timeline |
| Other auth data | Session tokens/hashes | Yes | Security | Required | Hosting/DB | Session lifetime / deletion |

---

## Remaining owner inputs

1. Legal business / operator name  
2. Privacy contact email  
3. Support email  
4. Business address (if required by store/jurisdiction)  
5. Effective date for Privacy/Terms  
6. Confirm production public domain for legal URLs  
7. App Store Connect + Play Console accounts  
8. Store screenshots, descriptions, support URL  
9. Demo / reviewer credentials  
10. Optional: decide whether mobile should ever expose Google disconnect (currently web-admin-only by design)  
11. EAS/store build numbers and release pipeline  

---

## Explicit non-claims

- Store compliance is **not** complete until owner finishes store-side declarations and placeholder replacement.  
- No analytics/tracking/ads/push were added.  
- Account deletion does **not** delete Google Sheets or shared lead rows.
