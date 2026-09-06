# PHASE 30.2E — FINAL FIX REPORT

Product: **Website CRM**  
Phase type: surgical fix of two Phase 30.2D confirmed bugs only  
Date: 2026-09-06

## M3 Fix

### Root cause
Outbox deduplication treated any historical matching `fromStatus`/`toStatus` pair (and completed outbox keys derived from those fields) as proof that a new Sheets write needed no timeline event. Cyclic workflows such as `A→B→A→B` incorrectly suppressed the later `A→B`.

### Exact fix
- Each successful Sheets status write creates a **new mutation ID** (`crypto.randomUUID()`).
- That ID is stored as `status_timeline_outbox.idempotency_key` and embedded in timeline `event_data.mutationId`.
- Dedup / retry checks **only** whether a timeline event already exists for that mutation ID.
- A later independent transition always gets a new mutation ID → a new timeline event.
- Flush recovers pending rows by mutation ID; repeated flush remains idempotent.

### Idempotency approach
Write-specific identity for the lifetime of one logical mutation/retry only. Not `(project, lead, from, to)`.

### Retry behavior
Timeline failure leaves one pending outbox row for that mutation. Flush creates at most one event. Re-flush after the event exists marks complete via `duplicatePrevented` without inserting again.

### Cyclic transition behavior
`A→B`, `B→A`, `A→B` yields **three** distinct `STATUS_CHANGED` events. Independent repeated `A→B` mutations also each get their own event.

### Crash window
Unchanged inherent limit: Google Sheets cannot participate in a DB transaction. Order remains Sheets write → outbox insert → timeline insert. Crash between Sheets success and outbox creation can still lose the pending record (no false timeline; no false rollback claim). Crash after timeline insert before mark-complete is healed by mutation-ID detection on flush.

### Tests
`phase-30-2e-final-fix.test.js` (M3.1–M3.11) and updated `phase-30-2c-hardening.test.js` M3 case.

---

## M7 Fix

### Root cause
`more.tsx` returned early on `!mountedRef.current` after `api.deleteAccount()` **before** calling `logout()`, so local SecureStore/session cleanup could be skipped after a successful server deletion.

### Exact fix
- Added `afterSuccessfulServerAccountDeletion` in `accountSettingsCore.js`.
- On delete success: **always** runs `clearLocalCredentials` (`logout()`), then runs UI (`Alert`) only if mounted.
- Failure path still does not clear credentials.

### Credential cleanup behavior
Server delete success → `logout()` always runs (API logout best-effort + SecureStore clear + in-memory auth reset via AuthProvider).

### Unmount behavior
Credentials cleared even when More screen unmounted. Alert/`setDeleting` gated on mount. No UI after unmount.

### Tests
`phase-30-2e-final-fix.test.js` M7 helper + More screen wiring tests.

---

## Validation

| Check | Result |
|---|---|
| Root `npm test` | **371 pass** / 0 fail |
| Root `npm run lint` | **PASS** |
| Root `npm audit --omit=dev` | **0 vulnerabilities** |
| Mobile `npm test` | **241 pass** / 0 fail |
| Mobile `npx tsc --noEmit` | **PASS** |
| Mobile `npm audit --omit=dev` | **14 moderate** (existing Expo transitive; not force-fixed) |
| `npx expo config --type public` | **PASS** — Website CRM / `chaturx` / `com.chaturx.leads` / projectId preserved |

---

## Remaining Known Limitations

- **H3** — rowNumber identity drift (no Stable Lead ID migration).
- **M5/M6** — CASCADE FK footguns deferred (anonymization-only hard-delete avoidance).
- **L3–L7** — deferred low-priority items (except prior L1/L2).
- **H2** — legal placeholders remain owner actions.
- Sheets/outbox crash window between successful Sheet write and outbox insert remains inherent.

---

## Changed Files

### Created
- `phase-30-2e-final-fix.test.js`
- `PHASE_30.2E_FINAL_FIX_REPORT.md`

### Modified
- `status-timeline-outbox.js`
- `lead-timeline.js`
- `phase-30-2c-hardening.test.js`
- `mobile/app/(app)/more.tsx`
- `mobile/utils/accountSettingsCore.js`
- `mobile/utils/accountSettings.ts`
- `mobile/package.json` (test script includes 30.2E)

---

## Final Status

**PASS** — both Phase 30.2D confirmed bugs fixed with regression coverage.  
No commit / no push / no EAS build performed.
