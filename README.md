# Marriage Swipe

| Folder | What it is |
|---|---|
| `api/` | Node.js 22 server (Express) + PostgreSQL. Accounts, photos, AI checks, swipes, chat, admin API. `npm test` runs 19 automated tests. |
| `web/` | Next.js website: sign up, selfie, swipe, chat, profile, plus the `/admin` super-admin console and the privacy / rules / delete-account pages. |
| `mobile/` | Flutter Android app (same server). |
| `deploy/` | Docker Compose + HTTPS for a Linux VPS. |
| `docs/` | Hostinger guide, Play Store checklist, store listing text. |

Start with `docs/DEPLOY-HOSTINGER.md`, then `docs/PLAY-STORE.md`.

## Run it on your own computer
```
# 1. database
createdb marriageswipe   # PostgreSQL 14+; create a user "marriage" with password "marriage" or set DATABASE_URL
# 2. server
cd api && cp .env.example .env && npm install
PUBLIC_API_URL=http://localhost:3000/api npm run create-admin -- you@example.com 'a-long-password' && npm run seed:demo
npm start                       # http://localhost:4000
# 3. website (another terminal)
cd web && npm install && npm run dev   # http://localhost:3000  (admin at /admin)
```

## How the checks work
- Signing up takes email + mobile number + password. Log in with either email or number.
- A live selfie becomes the reference face. Each extra photo must contain a face that matches it, and must not be explicit. The AI runs inside `api/` (no outside service). If it cannot decide, the photo waits for an admin.
- Admins sign in at `/admin`, review blurred photos, read reports, and can hold, remove, restore or delete any profile.
