# Website CRM — Mobile (Expo)

Isolated React Native / Expo client for the existing Website CRM backend.

Visible product name: **Website CRM**  
Package / bundle identity: `com.chaturx.leads`

The website under `public/` and the backend at the repo root remain separate from this package.

## Requirements

- Node.js 20+
- Expo Go (optional) or iOS Simulator / Android Emulator
- For store builds: Expo/EAS account (owner action)

## Setup

```bash
cd mobile
cp .env.example .env
npm install
```

Set public environment variables only (no secrets):

| Variable | Purpose |
|---|---|
| `EXPO_PUBLIC_API_BASE_URL` | Backend API origin |
| `EXPO_PUBLIC_LEGAL_BASE_URL` | Privacy/Terms origin (optional; defaults to API or production host) |

Development examples:

- Simulator: `http://localhost:3000`
- Physical phone: `http://<your-mac-lan-ip>:3000`

Production (also applied by `eas.json` production profile):

- `https://lead-admin-panel.vercel.app`

Never put `SESSION_SECRET`, `TOKEN_ENCRYPTION_KEY`, Turso tokens, Google client secrets, or passwords in mobile env.

## Start

```bash
cd mobile
npm start
```

## Production builds (EAS)

`eas.json` defines `development`, `preview`, and `production` profiles.

Owner actions still required:

1. Install/login to EAS CLI
2. Link/create an Expo project (`eas init` / project ID)
3. Configure Apple/Google credentials in EAS
4. Run builds (do not submit from this phase alone)

Example (owner-run, not performed automatically by Phase 30):

```bash
cd mobile
eas build --platform ios --profile production
eas build --platform android --profile production
```

## Scripts

- `npm start` — Expo dev server
- `npm run ios` / `npm run android`
- `npm run typecheck` — TypeScript check
- `npm test` — mobile-related Node tests

## Authentication

- `POST /api/mobile/auth/login`
- `GET /api/mobile/auth/me`
- `POST /api/mobile/auth/logout`

Opaque session token stored in **Expo SecureStore** and sent as `Authorization: Bearer <token>`.

Website continues to use cookie sessions + CSRF.
