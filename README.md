# Ours — a private digital home for two

A couples companion app: real-time chat (with optional end-to-end encryption), voice and
video calls, love notes, nudges, shared memories and a memory map, a calendar, lists, a bucket
list, date nights, a watchlist, wishlists, song of the day, a shared journal, games, a
year-in-review story, long-distance mode and a relationship counter. One space, exactly two people.

- **Web app:** React 19, TypeScript, Vite, Tailwind CSS 4, React Router, Zustand, TanStack Query, installable PWA
- **API:** Node.js, Express 5, TypeScript, Socket.IO, Mongoose (MongoDB)
- **Storage:** MongoDB GridFS ("App storage") and optional Google Drive

---

## Quick start

You need Node.js 20 or newer.

```bash
npm install
npm run dev
```

Open <http://localhost:5173>. That's it: with no configuration the server starts a temporary
in-memory MongoDB, generates throwaway secrets and prints email links (verification, password
reset) to the terminal instead of sending them. **Data is lost when the server restarts** until
you set `MONGODB_URI`.

To try it as a couple, register one account, create a space, then open the invite link in a
second browser (or a private window) and register the second account.

| Command | What it does |
| --- | --- |
| `npm run dev` | API on :4000 and web app on :5173, both with reload |
| `npm test` | Server test suite (71 tests, uses an in-memory MongoDB) |
| `npm run typecheck` | Type-check both projects |
| `npm run build` | Production build of the web app and the server |
| `npm start` | Run the built server; it also serves the built web app |
| `npm run vapid` | Generate keys for push notifications |

## Configuration

Copy `server/.env.example` to `server/.env`. Everything is optional in development; in
production the server refuses to start without `MONGODB_URI`, `JWT_ACCESS_SECRET`,
`JWT_REFRESH_SECRET` and `ENCRYPTION_KEY`.

| Feature | Variables | Cost |
| --- | --- | --- |
| Database | `MONGODB_URI` | MongoDB Atlas free tier (512 MB) |
| Email (verification, password reset) | `SMTP_*`, `MAIL_FROM` | Free tiers exist (Brevo, Resend SMTP, Gmail app password) |
| Google Sign-In | `GOOGLE_CLIENT_ID` | Free |
| Google Drive | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Free |
| Push notifications | `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` | Free |
| GIF and sticker search | `GIPHY_API_KEY` | Free developer key |
| Call relay (TURN) for strict networks | `METERED_DOMAIN`, `METERED_API_KEY` (or `TURN_URLS`…) | Free tier: 500 MB/month on Metered (only used when a direct connection fails); paid plans from US$99/month |
| Memory map place lookup | none (OpenStreetMap Nominatim); `GEOCODING=off` to disable | Free, fair use |

Features without configuration switch themselves off in the interface rather than showing
buttons that do nothing.

### Google setup (Sign-In and Drive)

1. In the [Google Cloud console](https://console.cloud.google.com/apis/credentials) create a
   project and an **OAuth client ID** of type *Web application*.
2. Authorised JavaScript origins: your web app URL (and `http://localhost:5173` for development).
3. Authorised redirect URI: `<SERVER_URL>/api/integrations/google-drive/callback`.
4. Enable the **Google Drive API** for the project.
5. On the OAuth consent screen add the scope `.../auth/drive.file`. While the app is in
   "Testing" mode, add both partners as test users.

The app only ever requests `drive.file`, which lets it see files and folders **it created
itself**. It cannot read anything else in the Drive. This scope is non-sensitive, so Google
does not require a paid security review to publish the consent screen.

## What's inside

```
couple-app/
├── client/                 React PWA
│   ├── public/             icons, widget templates, theme bootstrap
│   └── src/
│       ├── components/     ui kit (buttons, sheets, toasts…) and app shell
│       ├── features/       one folder per feature (chat, memories, notes…)
│       ├── lib/            API client, socket, dates, push, PWA helpers
│       ├── store/          auth, chat, realtime and UI state (Zustand)
│       └── sw.ts           service worker: offline shell, push, widgets
├── server/
│   ├── src/
│   │   ├── config/         validated environment
│   │   ├── middleware/     auth, couple isolation, rate limits, errors
│   │   ├── models/         Mongoose models
│   │   ├── routes/         REST API
│   │   ├── services/       notifications, push, storage, scheduler, mail…
│   │   └── sockets/        Socket.IO
│   └── tests/              integration tests
└── render.yaml             one-click deployment blueprint
```

### Data model

`User`, `Couple`, `Session`, `Message`, `Note` (love notes, "open when…", surprises, shared and
private notes), `Nudge`, `Memory`, `Album`, `Media`, `CalendarEvent`, `Countdown`, `SharedList`,
`BucketListItem`, `DateIdea`, `DailyQuestion`, `Mood`, `ActivityDay` (love streak),
`Notification`, `PushSubscription`, `Integration`.

Every couple-owned collection carries an indexed `coupleId`.

### Real time

Socket.IO carries chat messages, typing, presence, read receipts and nudges directly. For
everything else (lists, notes, calendar, memories…) the server emits a small `sync` event
naming what changed and both partners' apps refetch just that, so every screen stays live
without a bespoke event per feature.

### Encrypted chat

Optional, per couple. Both partners type the same passphrase; each device derives an AES-256-GCM
key from it (PBKDF2-SHA256, 600,000 rounds) and keeps it in IndexedDB. Text, photos, videos and
voice notes are encrypted on the device before upload, so the server stores only ciphertext.
What stays visible to the server: who sent a message and when, reactions, and call times.
Search runs on the device; push notifications say "Encrypted message" without a preview.
Changing the passphrase creates a new key; older messages stay readable on devices that have
the old one. Signing out removes keys from the device. Like any web-based encryption, it relies
on the server delivering honest app code.

### Calls

WebRTC voice and video calls. The server only rings the other device and relays connection
details over Socket.IO; audio and video travel directly between the two devices (always
encrypted in transit), or via a TURN relay when a direct route isn't possible. Without a relay,
calls work on most home Wi-Fi but can fail on some mobile networks.

> Encrypted chat, calls, the microphone and the camera all need a **secure origin**: `https://`
> in production, or `http://localhost` while developing. Opened over plain `http://` on your
> home network (for example from your phone), these features are switched off by the browser.

### Notifications

One pipeline (`server/src/services/notify.ts`) handles every type: it checks the recipient's
preferences, writes the in-app notification, pushes it over the socket and sends a web push
unless the person is already looking at the app or is inside their quiet hours. Scheduled
reminders (anniversaries, milestones, calendar reminders, "on this day", scheduled notes) run
from `services/scheduler.ts`; each carries a de-duplication key, so nothing is ever sent twice.

## Privacy and security

- Passwords hashed with bcrypt (cost 12). Login gives the same answer for a wrong password and
  an unknown email.
- Short-lived access tokens (15 minutes) held in memory; refresh tokens are random, stored only
  as a keyed hash, rotated on every use, and delivered in an `HttpOnly`, `Secure`,
  `SameSite` cookie scoped to `/api/auth`.
- **Couple isolation:** the couple is always resolved from the signed-in user, never from an id
  in the request, and membership is re-checked on every call. Records are loaded with
  `{ _id, coupleId }` together, so another couple's data is indistinguishable from data that
  doesn't exist. `server/tests/isolation.test.ts` attacks every resource type by id.
- Photos, videos and files are private by default and streamed only to the couple's two
  members. Uploads are type-checked from their actual bytes, not their file name.
- Google refresh tokens are encrypted at rest (AES-256-GCM).
- Helmet with a strict Content-Security-Policy, input validation on every endpoint (zod), and
  rate limits on sign-in, sign-up, password reset, invite codes, nudges and uploads.
- No public profiles, no third-party analytics, no trackers. Fonts are self-hosted.
- Signing out wipes everything the app cached on that device.

HTTPS is provided by the host (Render, Railway, Vercel and similar all terminate TLS for you).

## Docker

`docker-compose.yml` runs the app together with its own MongoDB. Your settings come from
`server/.env` (it must include `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` and `ENCRYPTION_KEY`,
because the container runs in production mode).

```bash
docker compose up --build -d     # build and start
docker compose logs -f app       # watch the server log
docker compose down              # stop; data stays in the "mongo-data" volume
```

Open <http://localhost:4000>. Data (accounts, chat, photos in App storage) lives in the
`mongo-data` volume and survives restarts and rebuilds; `docker compose down -v` deletes it.

When people reach it at another address, set `APP_URL` (used for links, cookies and CORS):
`APP_URL=https://ours.example.com docker compose up -d`. Add that address to your Google OAuth
client too (origin and `/api/integrations/google-drive/callback`). Use HTTPS in front of it
(Caddy, Nginx, Cloudflare Tunnel…): sign-in cookies, encrypted chat, calls and notifications
all need a secure origin. The image alone (`docker build -t ours .`) works on any container
host with an external `MONGODB_URI`.

## Deployment (free tier)

The simplest setup is **one web service** that serves both the API and the web app, plus a
MongoDB Atlas database. Cookies stay first-party and WebSockets work without extra setup.

1. Create a free cluster on [MongoDB Atlas](https://www.mongodb.com/atlas) and copy the
   connection string. Under *Network Access*, allow your host to connect.
2. Push this folder to a GitHub repository.
3. On [Render](https://render.com): **New → Blueprint**, choose the repository. `render.yaml`
   sets the build and start commands.
4. Fill in the environment variables it asks for. `CLIENT_URL` and `SERVER_URL` are both your
   Render URL, for example `https://ours.onrender.com`.

Things to know about free hosting:

- Render's free web services sleep after about 15 minutes without traffic and take up to a
  minute to wake. While asleep, scheduled reminders don't run; they catch up when the service
  wakes. A free uptime pinger hitting `/api/health` every 10 minutes keeps it awake.
- Atlas's free tier is 512 MB. Photos in "App storage" count towards that, so connect Google
  Drive (or move to a paid tier) before uploading a lot of video.

**Split hosting (optional):** to put the web app on Vercel or Netlify and the API elsewhere,
edit `client/vercel.json` so `/api/*` is proxied to your API host, set `VITE_SOCKET_URL` to the
API's URL when building the client, and set the server's `CLIENT_URL` to the web app's URL.

## Widgets, shortcuts and what the web can't do

| | Status |
| --- | --- |
| Installable app (home screen, own window, splash screen) | Supported |
| Offline app shell and last-seen data | Supported |
| Push notifications on the lock screen | Android, Windows, macOS; iPhone/iPad from iOS 16.4 when installed to the home screen |
| App-icon shortcuts (Send love, Nudge, Chat, Add memory) | Android, Windows, macOS, ChromeOS |
| Unread badge on the app icon | Where the OS supports the Badging API |
| Windows 11 Widgets board (days together, next date) | Experimental; Microsoft Edge only |
| iOS / Android home-screen and lock-screen widgets | **Not possible from a web app.** Requires a native app (for example a Capacitor wrapper with WidgetKit / Glance widgets) |

## Not yet verified against live services

These are fully implemented but could not be exercised end to end without real credentials.
Test each once after adding its keys:

- Google Sign-In and the Google Drive connection, upload, listing and download
- Web push delivery to real devices
- SMTP email delivery
- GIPHY search
- Windows 11 widgets (needs an installed Edge PWA on a Windows 11 PC)
- Calls through a TURN relay (calls were tested directly between two browsers)

## Not built yet

- Live two-way Google Calendar sync (the calendar exports a standard `.ics` file instead)
- Native iOS/Android wrapper for true home-screen widgets
- Encrypting notes, memories and other content end to end (only chat is end-to-end encrypted)
#   o u r s  
 