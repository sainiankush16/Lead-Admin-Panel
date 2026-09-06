# CHATURX Lead Management — Mobile (Expo)

Isolated React Native / Expo client for the existing Lead Admin backend.

The website under `public/` and the backend at the repo root are **not** part of this package and must remain unchanged.

## Requirements

- Node.js 20+
- Expo Go (optional) or iOS Simulator / Android Emulator

## Setup

```bash
cd mobile
cp .env.example .env
npm install
```

Set `EXPO_PUBLIC_API_BASE_URL` to your backend origin only (no secrets).

- Simulator: `http://localhost:3000`
- Physical phone: `http://<your-mac-lan-ip>:3000` (localhost on the phone is the phone itself)

## Start

```bash
cd mobile
npm start
```

Then press `i` for iOS simulator or `a` for Android emulator, or scan the QR code with Expo Go.

## Scripts

- `npm start` — Expo dev server
- `npm run ios` — open iOS
- `npm run android` — open Android
- `npm run typecheck` — TypeScript check

## Authentication (Phase 4)

Mobile login uses dedicated endpoints:

- `POST /api/mobile/auth/login`
- `GET /api/mobile/auth/me`
- `POST /api/mobile/auth/logout`

The opaque session token is stored in **Expo SecureStore** and sent as:

`Authorization: Bearer <token>`

The website continues to use cookie sessions + CSRF. Do not put secrets in `EXPO_PUBLIC_*`.
