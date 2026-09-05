# Lead Admin Backend

Backend for the Lead Admin Panel with one-time Google OAuth authorization and Google Sheets API access.

## 1. Requirements

- Node.js 20+
- A Google Cloud project
- OAuth 2.0 Web Application credentials
- Google Sheets API enabled
- Google Drive API enabled

## 2. Google Cloud setup

In Google Cloud Console:

1. Create/select a project.
2. Enable **Google Sheets API** and **Google Drive API**.
3. Configure the OAuth consent screen.
4. Create an OAuth Client ID of type **Web application**.
5. Add this Authorized Redirect URI:
   `http://localhost:3000/api/auth/google/callback`
6. Copy the Client ID and Client Secret into `.env`.

For production, use your HTTPS domain callback instead.

The backend requests:
- `openid`
- `email`
- `profile`
- `https://www.googleapis.com/auth/spreadsheets`
- `https://www.googleapis.com/auth/drive.readonly`

The Sheets scope is required so Lead Status can be written back to Google Sheets. If an older login used a read-only Sheets scope, sign out and reconnect Google once.

## 3. Configure and install

```bash
cp .env.example .env
npm install
```

Fill in `.env` with the Google OAuth web-client values, a strong session secret, a 64-character hexadecimal token-encryption key, and the one permitted `ADMIN_EMAIL`. `.env` is ignored by Git and must never be committed.

## 4. Run

```bash
npm start
```

Open:
`http://localhost:3000`

## 5. Frontend

Put the supplied `index.html` in `public/index.html`, or change the static path in `server.js`.

The backend implements the API endpoints expected by the frontend:

- GET `/api/auth/google`
- GET `/api/auth/google/callback`
- GET `/api/auth/me`
- POST `/api/auth/logout`
- GET `/api/sheets`
- GET `/api/sheets/:spreadsheetId/tabs`
- GET `/api/projects`
- POST `/api/projects`
- DELETE `/api/projects/:id`
- GET `/api/projects/:id/leads`
- PATCH `/api/projects/:id/leads/:rowNumber/status`
- POST `/api/projects/:id/lead-status-column`
- POST `/api/sync`

## 6. Security

Refresh tokens are encrypted at rest using AES-256-GCM.

Do not put Google Client Secret, refresh tokens, session secret, or encryption key into `index.html`.

For production:
- use HTTPS
- set `BASE_URL` to your real HTTPS origin
- use secure cookies
- restrict OAuth redirect URIs
- restrict `ADMIN_EMAIL` if only one admin should have access
- keep `.env` outside version control

The app uses secure, HttpOnly, SameSite cookies; OAuth state validation; session regeneration after login; a same-origin CSRF token for state-changing API requests; and safe generic API errors. In production, set `NODE_ENV=production`, use an HTTPS `BASE_URL`, and set `TRUST_PROXY=true` only when running behind a trusted HTTPS reverse proxy.
