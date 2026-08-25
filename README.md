# AbbasiConnect

AbbasiConnect is a minimal, text-only social platform built around verified human identity.

The first version deliberately has no photo uploads, video, stories, reels, or media infrastructure. The goal is to make the smallest useful social network first.

## MVP

- identity-first onboarding
- Aadhaar-ready verification layer
- text-only feed
- create text posts
- profiles
- follow and unfollow people
- PostgreSQL database
- separate web frontend and backend API so a mobile app can reuse the same backend later

## Architecture

```text
apps/web      React + Vite web client
apps/api      Fastify API + Prisma ORM
PostgreSQL    persistent database

Web browser -> API -> PostgreSQL
                  |
                  -> Identity verification adapter

Future mobile app -> same API -> same PostgreSQL
```

The repository ships with a development-only Aadhaar simulator. It does not ask for or store a real Aadhaar number. In production, the adapter can be replaced by an authorized Aadhaar authentication integration or a compliant offline e-KYC verification flow.

## Data model

- `User`
- `Post`
- `Follow`

The app stores an internal identity reference hash, not a raw Aadhaar number.

## Quick start

### 1. Requirements

Install:

- Node.js 22 LTS recommended, or another version supported by current Prisma and Vite
- npm
- Docker Desktop, for the easiest local PostgreSQL setup

### 2. Clone

```bash
git clone https://github.com/abdullah-x-bd/AbbasiConnect.git
cd AbbasiConnect
```

### 3. Install packages

```bash
npm install
```

### 4. Start PostgreSQL

```bash
docker compose up -d db
```

This creates a local database with:

- host: `localhost`
- port: `5432`
- database: `abbasiconnect`
- username: `abbasi`
- password: `abbasi_dev_password`

### 5. Configure the backend

macOS/Linux:

```bash
cp apps/api/.env.example apps/api/.env
```

Windows PowerShell:

```powershell
Copy-Item apps/api/.env.example apps/api/.env
```

The supplied development connection string already matches `docker-compose.yml`.

### 6. Configure the web app

macOS/Linux:

```bash
cp apps/web/.env.example apps/web/.env
```

Windows PowerShell:

```powershell
Copy-Item apps/web/.env.example apps/web/.env
```

### 7. Generate the database client and create tables

```bash
npm run db:generate
npm run db:init
```

### 8. Run frontend and backend

```bash
npm run dev
```

Then open:

- web app: `http://localhost:5173`
- API health check: `http://localhost:3001/health`

## Development login

The current login screen is a simulator for the identity handoff. Enter a name and any fake development reference such as:

```text
DEV-ABBASI-001
```

Do not enter a real Aadhaar number.

The backend turns that reference into a one-way internal identity hash and returns an application token. This lets the user, feed, post, follow, frontend, backend, and database flow work before a production Aadhaar provider is connected.

## Real Aadhaar integration

Treat Aadhaar as an identity-verification provider behind the backend, not as the database primary key and not as a field exposed to the frontend after verification.

Two production paths can be integrated later:

1. Authorized online Aadhaar authentication through the applicable AUA/Sub-AUA ecosystem.
2. Aadhaar Paperless Offline e-KYC, where the resident provides UIDAI-signed offline data and the app verifies it without collecting or storing the Aadhaar number.

After successful identity verification, AbbasiConnect should issue its own user ID and its own session. Normal return visits should use that application session or another low-friction sign-in mechanism rather than repeatedly collecting identity data.

## API endpoints in the starter

```text
GET    /health
POST   /auth/dev-aadhaar
GET    /auth/me
GET    /feed
POST   /posts
GET    /users/:username
POST   /users/:id/follow
DELETE /users/:id/follow
```

## Documentation

- `ARCHITECTURE.md`
- `docs/LOCAL_SETUP.md`
- `docs/DATABASE.md`
- `docs/AADHAAR_INTEGRATION.md`
- `docs/PRODUCT_MVP.md`
- `docs/DEPLOYMENT_NOTES.md`

## Next milestones

1. Get this starter running locally.
2. Replace development identity simulator with production identity adapter.
3. Add username selection and onboarding.
4. Add member search, replies, and likes.
5. Add moderation, reporting, blocks, and mutes.
6. Deploy API and PostgreSQL.
7. Deploy web client.
8. Build a mobile client against the same API.
