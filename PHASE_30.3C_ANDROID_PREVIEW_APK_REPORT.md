# PHASE 30.3C — ANDROID PREVIEW APK REPORT

## Purpose

Installable Android APK intended for real-device QA.

**Status:** build not started — preflight blocked.

## Project

| Item | Value |
|---|---|
| Product | Website CRM |
| Expo slug | `chaturx` |
| EAS owner (config) | `sainiankush16s-team` |
| EAS project (expected) | `@sainiankush16s-team/chaturx` |
| EAS project ID (config) | `371610cf-f7db-4582-a68f-bf5ae57741cd` |
| Android package | `com.chaturx.leads` |
| Version | `1.0.0` |
| Android versionCode | `1` |

## Configuration

Existing `mobile/eas.json` (unchanged — no edits made):

**preview** (intended QA profile):

```json
"preview": {
  "distribution": "internal",
  "android": {
    "buildType": "apk"
  }
}
```

**production** (left untouched):

```json
"production": {
  "distribution": "store",
  "android": {
    "buildType": "app-bundle"
  },
  "env": {
    "EXPO_PUBLIC_API_BASE_URL": "https://lead-admin-panel.vercel.app",
    "EXPO_PUBLIC_LEGAL_BASE_URL": "https://lead-admin-panel.vercel.app"
  }
}
```

| Item | Status |
|---|---|
| Preview profile used | **Not used** — build not started |
| Preview APK build type | Already `apk` — no `eas.json` change required |
| Production profile | Untouched |
| Production API | `https://lead-admin-panel.vercel.app` |
| Legal URL | `https://lead-admin-panel.vercel.app` |

Note: preview does not set `EXPO_PUBLIC_*` in `eas.json`. Release builds still fall back to the production public host in `mobile/lib/config.ts` when env is unset (`__DEV__` false). No localhost/LAN introduced. No production profile changes made.

## Validation

| Check | Result |
|---|---|
| Git status before build | **Clean** — HEAD `7578c16 Complete production bug hardening` |
| Expo public config | **PASS** — Website CRM / `chaturx` / owner / projectId / `com.chaturx.leads` / version `1.0.0` / versionCode `1` |
| EAS `whoami` | **FAIL** — `Forbidden` (GraphQL), later hung |
| EAS `project:info` | **Not completed** — blocked by auth failure |
| Mobile `npm test` | **Not run** — stopped at EAS auth gate |
| TypeScript | **Not run** — stopped at EAS auth gate |

## Build

| Item | Result |
|---|---|
| Command | **Not executed** |
| Intended command | `npx --yes eas-cli@23.2.0 build --platform android --profile preview` |
| EAS build ID | **N/A** |
| Build status | **NOT STARTED** |
| Artifact type | **N/A** |
| Artifact URL | **N/A** (no fake URL) |

## Signing Safety

Production Android signing credential was **NOT** modified.

- No credentials delete/replace/rotate.
- Production keystore / Build Credentials `tbcCtwZtcq` not touched.
- Preview credential creation was not attempted (build never started).

## Submission

**NOT SUBMITTED TO GOOGLE PLAY**

## Result

**APK BUILD BLOCKED**

### Blocker

EAS CLI authentication failed (`Forbidden` / GraphQL). Per Phase 30.3C rules: stop; do not create a new EAS project; do not build.

### Owner action required

1. Ensure Expo/EAS session works for an account with access to `sainiankush16s-team` (e.g. re-login: `npx --yes eas-cli@23.2.0 login`).
2. Confirm:
   - `npx --yes eas-cli@23.2.0 whoami`
   - `npx --yes eas-cli@23.2.0 project:info` → `@sainiankush16s-team/chaturx` / `371610cf-f7db-4582-a68f-bf5ae57741cd`
3. Re-run Phase 30.3C from a clean tree.
4. If EAS asks to create **preview** credentials during the preview build: pause and approve explicitly — do **not** replace production credential `tbcCtwZtcq`.

After a successful preview APK:

**READY FOR PHASE 30.3D — PHYSICAL ANDROID DEVICE QA**

---

## Notes

- No `eas build`, `eas submit`, commit, or push.
- `mobile/eas.json` not modified.
- No application/backend/signing/identity changes.
- No secrets printed.
