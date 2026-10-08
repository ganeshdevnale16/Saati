# Saathi — Location Sharing & SOS

**Developed by Devnale Globals**

Saathi lets people share their live location for a set time (1 hour, 1 day, 1 week, 1 month, custom, or until they stop), ask others for their location with approval, see live position plus history timeline, get alerts when someone comes within a chosen distance, and send an SOS to everyone connected.

```
saathi/
├── backend/   Node.js + Express + Socket.io + PostgreSQL (API, realtime, push, jobs)
├── mobile/    Expo / React Native app (Android + iOS) with background tracking
├── web/       Web dashboard (served by the backend at /)
└── render.yaml
```

## Features

| Area | What it does |
|---|---|
| Identity | Mobile number is the unique ID (normalised to +91 format). OTP verification at signup, password login by mobile or email, password reset by OTP. |
| Signup | Full name, mobile + OTP, email, date of birth, gender, city, emergency contact, password, privacy consent. |
| Share | Share with a mobile number or Gmail/email. Durations: 1h / 1d / 1w / 1m / custom hours / until stopped. Works even if the other person hasn't joined yet — invite links up automatically when they sign up. |
| Track | Request someone's location; they approve, decline, or change the duration. Live map, battery, speed, call and directions buttons. |
| History | Timeline of stays ("10:05–11:40, stayed 95 min") and journeys, for last hour / today / 24h / 7 days. Viewers only see history recorded **during** their share window. |
| Nearby alert | Per person, adjustable radius (default 5 km), centred on you or on a fixed place (e.g. home). Enter/leave notifications with hysteresis so it doesn't spam at the edge. |
| SOS | Hold 3 seconds (prevents pocket triggers). Alerts everyone in an active share + your emergency contact, with location link and call number. High-priority push on a dedicated Android channel. "I'm safe now" resolves it. |
| Background | Location keeps updating when the app is closed (Android foreground service with visible notification; iOS background location with blue indicator). |
| Offline | Every point is saved on the device first, then uploaded. No internet → points queue locally (up to ~20,000) and upload automatically when back online. Server de-duplicates by point ID and keeps the original device time. |
| Notifications | In-app list + realtime socket + mobile push for requests, approvals, stops, expiry, proximity, SOS. |
| Enterprise basics | JWT auth, bcrypt passwords, OTP rate limiting and attempt lockout, API rate limits, Helmet, input validation (zod), audit log of every share/SOS action, auto-expiry job, data-retention purge (default 90 days). |

## 1. Run the backend locally

```bash
cd backend
cp .env.example .env          # set DATABASE_URL to a Postgres database
npm install
npm run dev                   # creates tables automatically, serves web at http://localhost:4000
```

With `OTP_DEV_MODE=true`, the OTP is shown on screen and in the server log so you can test without an SMS provider.

## 2. Deploy on Render (same flow as your other projects)

1. Push this folder to a GitHub repo.
2. In Render: **New → Blueprint** → select the repo. `render.yaml` creates the web service and a Postgres database.
3. Open `https://<your-app>.onrender.com` — that's the web dashboard.
4. Before real users: set `OTP_DEV_MODE=false`, `SMS_PROVIDER=msg91`, and your MSG91 key + DLT-approved template ID.

Note: Render's free web service sleeps after inactivity, which delays push/SOS delivery by up to a minute on wake. For SOS reliability, use a paid instance (always on).

## 3. Run the mobile app

```bash
cd mobile
npm install
npx expo install --fix        # aligns all package versions with the Expo SDK
```

Edit `app.json`:
- `extra.apiUrl` → your Render URL
- `android.config.googleMaps.apiKey` → Google Maps Android key

Background location and push **do not work in Expo Go**. Build a development build:

```bash
npm install -g eas-cli
eas login
eas init                      # fills extra.eas.projectId
eas build -p android --profile preview    # installable APK
```

For push on Android, add your Firebase `google-services.json` via `eas credentials` (FCM v1).

## App download page

- `https://YOUR-SITE/download` is the public download page (also `/get-app` and `/app`). It detects Android, iPhone and desktop, and shows a QR code to desktop visitors.
- `https://YOUR-SITE/download/android` is a stable link to share on WhatsApp. It always points to the latest APK.
- Where the APK comes from, in order: `PLAY_STORE_URL` (once published), then `APK_URL` (recommended: a GitHub Release asset), then the file `web/downloads/saathi.apk`.
- To release a new version, upload the new APK to a new GitHub Release, then update `APK_URL` and `APP_VERSION` in Render → Environment. No code change is needed.
- Every download is logged in `audit_logs` with action `app_download`.

## API summary

| Method | Path | Purpose |
|---|---|---|
| POST | /api/auth/otp | Send OTP (`register` / `reset`) |
| POST | /api/auth/register | Create account |
| POST | /api/auth/login | Sign in (mobile or email) |
| POST | /api/auth/reset | Reset password |
| GET/PATCH | /api/auth/me | Profile |
| POST | /api/auth/push-token | Save device push token |
| GET | /api/shares | sharing / tracking / incoming / outgoing |
| POST | /api/shares/offer | Start sharing my location |
| POST | /api/shares/request | Ask for someone's location |
| POST | /api/shares/:id/approve · reject · stop | Manage a share |
| PATCH | /api/shares/:id/alert | Nearby-alert radius & centre |
| POST | /api/locations/batch | Upload live or offline points (≤500) |
| GET | /api/locations/live | Latest positions I can see |
| GET | /api/locations/history/:userId?from=&to= | Points + timeline |
| POST | /api/sos · /api/sos/:id/resolve | Send / resolve SOS |
| GET | /api/sos/active | Active SOS (mine + connected people) |
| GET | /api/notifications | Notification list |

Socket events (client listens): `location:update`, `notification`, `shares:changed`.

## Before launching to the public

- **Play Store background location review**: Google requires a declaration form and a short video showing why "Allow all the time" is needed. The visible sharing notification and the consent screen in this app support that review.
- **Privacy policy & DPDP Act 2023**: publish a privacy policy covering what is collected, retention period, and how users delete their data. Add a "Delete my account" flow before launch.
- **SMS**: Indian OTP SMS needs a DLT-registered sender ID and template (MSG91, Gupshup, etc.).
- **Scale path**: when you pass a few thousand active sharers, add Redis (socket.io adapter + caching latest locations), move proximity checks to a queue worker, and partition the `locations` table by month (or use TimescaleDB).
- **Monitoring**: add Sentry (backend + mobile) and uptime checks on `/api/health`.

---
© Devnale Globals
