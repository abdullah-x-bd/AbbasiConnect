# AbbasiConnect

AbbasiConnect is a minimal, text-only social platform built around verified human identity.

The product deliberately has no social profile photos, video, stories, reels, or media feed. Aadhaar card imagery is treated only as temporary identity-onboarding input.

## Account model

The product now has two completely separate entry paths.

### Register

```text
Register
  -> upload Aadhaar card image
  -> OCR reads the name
  -> Aadhaar verification adapter verifies the identity
  -> short-lived registration proof
  -> account details page
  -> create account
```

The account-details page collects:

- name
- username
- password and password confirmation
- email and/or contact number, with at least one required
- date of birth, with age calculated from DOB
- optional gender
- optional city and state
- country
- optional short bio

Passwords are stored only as bcrypt hashes.

The verified identity is linked one-to-one to the account through the unique `identityRefHash` field. The Aadhaar card image is not stored in the social database and the identity reference is not exposed on public profiles.

### Sign in

Returning users do not repeat Aadhaar onboarding.

```text
Sign in
  -> username
  -> password
  -> AbbasiConnect session
```

## Implemented product scope

### 1. Identity and account onboarding

- landing screen with `Register` and `Sign in`
- Aadhaar-card photo upload flow
- backend OCR using Tesseract.js
- likely English name extraction from OCR text
- development Aadhaar verification adapter
- short-lived registration proof after identity verification
- account-details page after Aadhaar verification
- one verified identity mapped to one account
- username/password authentication for returning users
- bcrypt password hashing
- private email/contact/DOB account fields
- no permanent Aadhaar-card image field in the social database

The OCR piece is implemented. Live UIDAI Aadhaar authentication is still represented by the development verification reference and remains behind the replaceable identity adapter.

### 2. Member discovery

- search by display name
- search by username
- blocked/suspended accounts excluded from discovery

### 3. Profiles and connections

- public text profile
- editable display name
- editable username
- short bio
- optional location
- private account details page for the signed-in user
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
apps/api      Fastify API + Prisma ORM + Tesseract OCR
PostgreSQL    persistent database

Browser -> API -> PostgreSQL
             |
             +-> temporary OCR card scan
             |
             -> Identity verification adapter
```

The backend remains the canonical application layer so later clients can use the same API without changing the social data model.

## Data model

The `User` model now includes account credentials/profile fields in addition to the social graph:

- unique internal Aadhaar-linked identity reference hash
- optional last four digits for development display/support use
- identity-derived name
- display name
- username
- password hash
- email
- phone
- date of birth
- optional gender/location
- role and moderation state

Social models:

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

The first OCR operation may need to obtain Tesseract's English recognition data. After the card is read, the image is not written to the AbbasiConnect database.

## Upgrading an earlier local AbbasiConnect database

If you already ran an earlier starter locally:

```bash
git pull
npm install
npm run db:generate
npm run db:upgrade
npm run dev
```

The new credential fields are migration-compatible with old development rows. Old accounts created before password authentication have no usable password and should be replaced with fresh development accounts through the new Register flow.

## Development registration

Use a test Aadhaar-like image for local development. OCR will attempt to read the name.

For the development verification stage use a fake unique reference such as:

```text
DEV-ABBASI-001
```

That fake reference stands in for the unique reference returned by a future production Aadhaar authentication adapter. Once used to create an account, the same reference cannot create another account.

After verification, complete the account form and choose a password. On later visits use `Sign in` with the username and password only.

The production boundary is documented in `docs/AADHAAR_INTEGRATION.md`.

## Testing moderation locally

New accounts have the `MEMBER` role.

```bash
npm run db:studio
```

Open the `User` table, find your test account, change `role` from `MEMBER` to `MODERATOR`, save it, then sign out and sign in again. A `Moderation` tab will appear.

## Current API surface

```text
GET    /health

POST   /auth/dev-aadhaar/scan
POST   /auth/dev-aadhaar/verify
POST   /auth/register
POST   /auth/sign-in
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

- verified Aadhaar QR/offline e-KYC parsing
- live UIDAI/Aadhaar authentication provider integration
- email/contact OTP verification and account recovery
- notifications
- public deployment
- mobile clients
