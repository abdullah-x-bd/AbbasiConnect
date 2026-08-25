# AbbasiConnect

AbbasiConnect is a minimal, text-only social platform built around verified human identity.

The product deliberately has no social profile photos, video, stories, reels, or media feed. Aadhaar card imagery is treated only as temporary identity-onboarding input.

## Implemented product scope

### 1. Identity onboarding

- Aadhaar-card upload shaped onboarding flow
- development-only card reading adapter
- extracted-name confirmation/editing screen
- username selection
- verified identity reference mapped to an internal user UUID
- no permanent Aadhaar-card image field in the social database

### 2. Member discovery

- search by display name
- search by username
- blocked/suspended accounts excluded from discovery

### 3. Profiles and connections

- public text profile
- editable display name
- editable username
- short bio
- follower/following counts
- follow/unfollow
- member post history

### 4. Replies

- text replies on posts
- reply counts
- nested reply display under the parent post

### 5. Likes

- like/unlike posts and replies
- like counts
- current-user like state

### 6. Safety and moderation

- block members
- blocking removes follows in both directions
- blocked members no longer appear to each other in feed/search/profile access
- report posts or members
- moderator/admin roles
- moderation queue
- mark reports reviewed
- dismiss reports
- hide/restore posts
- suspend/restore users

## Architecture

```text
apps/web      React + Vite web client
apps/api      Fastify API + Prisma ORM
PostgreSQL    persistent database

Browser -> API -> PostgreSQL
             |
             -> Identity adapter
```

The backend remains the canonical application layer so later clients can use the same API without changing the social data model.

## Data model

- `User`
- `Post`
- `Follow`
- `Like`
- `Block`
- `Report`

Replies are represented as posts with `parentId`.

## Fresh local setup

Requirements:

- Node.js 22 LTS recommended
- npm
- Docker Desktop

```bash
git clone https://github.com/abdullah-x-bd/AbbasiConnect.git
cd AbbasiConnect
npm install
docker compose up -d db
```

Windows PowerShell:

```powershell
Copy-Item apps/api/.env.example apps/api/.env
Copy-Item apps/web/.env.example apps/web/.env
```

macOS/Linux:

```bash
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env
```

Generate the Prisma client and create a fresh database schema:

```bash
npm run db:generate
npm run db:init
```

Start the product:

```bash
npm run dev
```

Open:

```text
http://localhost:5173
```

API health check:

```text
http://localhost:3001/health
```

## Upgrading an earlier local AbbasiConnect database

If you already ran the old three-table starter locally, pull the latest code and run:

```bash
git pull
npm install
npm run db:generate
npm run db:upgrade
npm run dev
```

Prisma will create/apply the local migration needed for the expanded schema.

## Development onboarding

The current UI starts with an Aadhaar-card shaped upload flow, but the development adapter is not a real Aadhaar OCR/authentication service.

Use a test image and a fake verification reference such as:

```text
DEV-ABBASI-001
```

Do not upload a real Aadhaar card or use a real Aadhaar number with the development endpoints.

The production boundary is documented in `docs/AADHAAR_INTEGRATION.md`.

## Testing moderation locally

New accounts have the `MEMBER` role.

To make a development account a moderator:

```bash
npm run db:studio
```

Open the `User` table, find your test account, change `role` from `MEMBER` to `MODERATOR`, save it, then log out and back in. A `Moderation` tab will appear in the web app.

## Current API surface

```text
GET    /health

POST   /auth/dev-aadhaar/scan
POST   /auth/dev-aadhaar
GET    /auth/me

PATCH  /users/me
GET    /users/search
GET    /users/:username
POST   /users/:id/follow
DELETE /users/:id/follow
POST   /users/:id/block
DELETE /users/:id/block

GET    /feed
POST   /posts
GET    /posts/:id/replies
POST   /posts/:id/replies
POST   /posts/:id/like
DELETE /posts/:id/like

POST   /reports
GET    /moderation/reports
PATCH  /moderation/reports/:id
```

## What remains intentionally deferred

- production OCR/secure QR extraction
- live Aadhaar verification/provider integration
- notifications
- public deployment
- mobile clients

Those pieces can be added on top of the current social product without redesigning milestones 1 through 6.
