# PHASE 30.2C — BUG FIX REPORT

Product: **Website CRM**  
Phase type: bug fix / hardening (no new product features, no architecture redesign)  
Date: 2026-09-06

## Summary

- status: **PASS WITH ISSUES**

Code-level audit bugs H1/M1, M2, M3, M4, M7, M8 are fixed with regression coverage. Root and mobile validation suites pass. EAS CLI `project:info` could not authenticate in this environment (Forbidden); identity is still verified via `app.json` / Expo public config / existing readiness tests. Owner/legal/signing/store actions remain outside this phase.

---

## Bugs Fixed

### H1 / M1 — Admin bootstrap must never revive deleted/inactive admins

- **ID:** H1, M1
- **Root cause:** `bootstrapAdminUser` could select an inactive/deleted admin row and rewrite/reactivate it on restart; credential rewrite did not always bump `session_version`.
- **Files changed:** `app-users.js`, `phase-30-2c-hardening.test.js`
- **Fix:**
  - Bootstrap targets only **active** admins (`is_active = 1` and `login_id NOT LIKE 'deleted_%'`).
  - Matching inactive/deleted `ADMIN_LOGIN_ID` throws (does not revive).
  - If an active admin exists, credentials may be rewritten on that row only; otherwise a new admin is inserted.
  - Credential rewrite increments `session_version` (invalidates browser/mobile sessions via existing `currentAppUser` check).
  - Idempotent when login + hash already match.
  - Final-admin deletion protection unchanged.
- **Regression test:** `phase-30-2c-hardening.test.js` (H1/M1 cases A–H covered).

### M2 — Login rate limiting

- **ID:** M2
- **Root cause:** Browser and mobile login endpoints allowed unlimited password attempts at the app layer.
- **Files changed:** `login-throttle.js` (new), `server.js`, `phase-30-2c-hardening.test.js`, `package.json` (lint)
- **Fix:**
  - DB-backed throttle (`login_throttle` table) for both `POST /api/auth/login` and `POST /api/mobile/auth/login`.
  - Buckets: IP+login (strict), login-only, IP-only (higher threshold for shared NAT).
  - Failed attempts recorded; successful login clears buckets.
  - Temporary block (15 minutes); generic auth / throttle messages; no password/token logging; no login-existence leak.
  - Persistent store chosen because in-memory limits are insufficient on multi-instance Vercel/serverless.
- **Regression test:** `phase-30-2c-hardening.test.js` (M2).

### M3 — Sheets write success / timeline failure

- **ID:** M3
- **Root cause:** Status PATCH could update Google Sheets then fail on timeline insert, returning 500 and risking a permanently missing `STATUS_CHANGED` event.
- **Files changed:** `status-timeline-outbox.js` (new), `server.js`, `lead-status-mobile.test.js`, `phase-30-2c-hardening.test.js`
- **Fix:**
  - Sheets write still happens first; timeline only after success.
  - Durable `status_timeline_outbox` with idempotency key (project, lead, from/to, actor).
  - On timeline failure: keep pending row; API returns `ok` + `sheetUpdated: true` + `timelinePending: true` (not a false Sheets-failure 500).
  - Later status requests (including same-status) flush pending outbox; duplicate events prevented via matching check.
- **Regression test:** `phase-30-2c-hardening.test.js` (M3 A–F).

### M4 — Concurrent status update race

- **ID:** M4
- **Root cause:** No server-side per-lead lock; concurrent status patches could race.
- **Files changed:** `status-update-lock.js` (new), `server.js`, `phase-30-2c-hardening.test.js`
- **Fix:**
  - Per-lead lock key `lead_status:{projectId}:{rowNumber}`.
  - In-process promise chain + DB lock rows with TTL cleanup.
  - 409 when lock cannot be acquired; no global app lock; bulk concurrency of 4 preserved.
- **Regression test:** `phase-30-2c-hardening.test.js` (M4 serialization).

### M7 — Mobile unmounted state / async safety

- **ID:** M7
- **Root cause:** Several screens could call `setState` after unmount.
- **Files changed:** `mobile/hooks/useMountedRef.ts` (new), `mobile/app/(app)/index.tsx`, `more.tsx`, `search.tsx`, `projects/index.tsx`, `projects/new.tsx`, `projects/[projectId]/lead/[rowNumber].tsx`, `phase-30-2c-hardening.test.js`
- **Fix:** Shared `useMountedRef` (same pattern as lead list); guards on async success/error paths; loading/busy cleared only when mounted.
- **Regression test:** `phase-30-2c-hardening.test.js` (M7 import/wiring checks).

### M8 — Screen capture protection failure behavior

- **ID:** M8
- **Root cause:** Comments implied fail-closed while runtime swallowed errors (fail-open for availability).
- **Files changed:** `mobile/components/ScreenCaptureProtection.tsx`, `screen-capture-protection-mobile.test.js`
- **Fix:** Document intentional **fail-open** for app availability; `__DEV__`-only warn on enable failure; preserve Android FLAG_SECURE / iOS switcher / AppState overlay / cleanup; no production crash on native API failure.
- **Regression test:** screen-capture + hardening M8 assertions.

### L1 / L2 (safe low-priority)

- **L1:** Mobile session tokens deleted on user deactivate and password reset (`server.js`).
- **L2:** `/api/auth/me` exposes `googleEmail` only to admins (`server.js`).

---

## Bugs Intentionally Not Fixed

### H3 — Stable Lead ID / rowNumber drift

- **Why:** Architectural/data-migration change (identity beyond sheet row numbers) requires deliberate design for existing projects.
- **This phase:** No Stable Lead ID column; no identity architecture change; current rowNumber behavior preserved; documented as known limitation.
- **Risk:** Inserts/deletes in Google Sheets can shift row-number identity for timeline/remarks.

### M5 / M6 — FK CASCADE footguns

- **M5:** `lead_remarks.author_user_id → app_users ON DELETE CASCADE` could wipe remarks on hard-delete of `app_users`.
- **M6:** `projects.user_id → users ON DELETE CASCADE` is an operational footgun for Google `users` rows.
- **Why deferred:** Application account deletion uses **anonymization**, not hard-delete of `app_users`. Risky production schema migration without data-loss review is out of scope.
- **Mitigation:** Document risk; do not hard-delete `app_users` / Google `users` via ad-hoc SQL; prefer anonymization paths already shipped.

### Low-priority deferred

| ID | Item | Why deferred |
|---|---|---|
| L3 | Password step-up for account deletion | Product/UX change; not invent requirements |
| L4 | spreadsheetId exposure reduction | Needs careful admin UI/auth review |
| L5 | Phone substring false positives | Search behavior change risk |
| L6 | Blank Lead Status display | Existing “New” mapping is intentional product rule |
| L7 | Stale documentation | Minor doc sync only; partial EAS link wording updated where touched |

### H2 — Legal placeholders

- Do **not** invent business name, address, email, or effective date.
- **Owner action:** replace placeholders on privacy/terms/delete-account pages before store submission.

---

## Security Changes

- Bootstrap cannot revive deleted/inactive admins.
- Credential rewrite bumps `session_version` (session invalidation).
- DB-backed login throttling on browser + mobile login.
- Generic auth/throttle errors; no password/token leakage in responses/logs from these paths.
- Mobile tokens cleared on deactivate / password reset.
- `googleEmail` limited to admin `/api/auth/me`.
- Screen-capture failure semantics documented; protection not weakened.

---

## Data Integrity Changes

- Status timeline outbox after successful Sheets writes.
- API distinguishes complete success vs `sheetUpdated` + `timelinePending`.
- Idempotent flush prevents duplicate `STATUS_CHANGED` events.
- Per-lead status locks reduce concurrent history/Sheet races.
- Same-status skip and Sheets-before-timeline ordering preserved.

---

## Mobile Stability Changes

- Mounted-ref guards on dashboard, More, search, projects list, new project, lead detail.
- Screen-capture comments + DEV diagnostics aligned with fail-open availability behavior.

---

## Tests

| Check | Result |
|---|---|
| Root `npm test` | **363 pass** / 0 fail |
| Root `npm run lint` | **PASS** |
| Root `npm audit --omit=dev` | **0 vulnerabilities** |
| Mobile `npm test` | **233 pass** / 0 fail |
| Mobile `npx tsc --noEmit` | **PASS** (exit 0) |
| Mobile `npm audit --omit=dev` | **14 moderate** (Expo transitive: `decode-uri-component` / `uuid` via expo-router / config-plugins; force-fix would break Expo — not applied) |
| `npx expo config --type public` | **PASS** — name Website CRM, slug `chaturx`, packages `com.chaturx.leads`, owner `sainiankush16s-team`, projectId `371610cf-f7db-4582-a68f-bf5ae57741cd` |
| `npx eas-cli@23.2.0 project:info` | **FAILED** — `Forbidden` / GraphQL (CLI not authenticated in this environment). Identity still verified via Expo config + readiness tests. |

---

## Remaining Production Blockers

### Code blockers

- None identified for the fixed audit items above.
- **Known limitation (non-blocking for this phase):** H3 rowNumber identity drift.
- **Operational risk (non-blocking if anonymization-only):** M5/M6 CASCADE FKs if someone hard-deletes rows via SQL.

### Owner / legal actions

- Replace legal placeholders (business name, address, email, effective date) — do not invent.
- Confirm production env secrets / Admin bootstrap credentials are set correctly (prefer a login ID that does not collide with a deleted admin).
- Re-run `eas project:info` while logged into EAS as `sainiankush16s-team` to confirm live GraphQL linkage.

### Signing / store actions

- EAS credentials / keystore / Apple signing setup.
- Production `eas build` / store submit (explicitly **not** run in this phase).
- Play / App Store listing, privacy questionnaires, screenshots.

---

## Production Identity (preserved)

| Item | Value |
|---|---|
| App name | Website CRM |
| Slug | `chaturx` |
| Android | `com.chaturx.leads` |
| iOS | `com.chaturx.leads` |
| EAS owner | `sainiankush16s-team` |
| EAS project | `@sainiankush16s-team/chaturx` |
| Project ID | `371610cf-f7db-4582-a68f-bf5ae57741cd` |
| Production API | `https://lead-admin-panel.vercel.app` |

---

## Changed Files

### Created

- `login-throttle.js`
- `status-timeline-outbox.js`
- `status-update-lock.js`
- `phase-30-2c-hardening.test.js`
- `mobile/hooks/useMountedRef.ts`
- `PHASE_30.2C_BUG_FIX_REPORT.md`
- (also present from prior phase work, still uncommitted in workspace): `PHASE_30_2_EAS_PRODUCTION_READINESS.md`, `phase-30-2-eas-readiness.test.js`

### Modified

- `app-users.js`
- `server.js`
- `package.json`
- `lead-status-mobile.test.js`
- `screen-capture-protection-mobile.test.js`
- `PHASE_30_1_COMPLIANCE.md`
- `PHASE_30_STORE_READINESS.md`
- `mobile/package.json`
- `mobile/app.json` (EAS owner/projectId linkage from prior readiness)
- `mobile/eas.json` (store distribution from prior readiness)
- `mobile/components/ScreenCaptureProtection.tsx`
- `mobile/app/(app)/index.tsx`
- `mobile/app/(app)/more.tsx`
- `mobile/app/(app)/search.tsx`
- `mobile/app/(app)/projects/index.tsx`
- `mobile/app/(app)/projects/new.tsx`
- `mobile/app/(app)/projects/[projectId]/lead/[rowNumber].tsx`

---

## Git note

- **No commit / no push** performed in this phase (per instructions).
- Run `git status --short` and `git diff --stat` for the live workspace snapshot at completion.
