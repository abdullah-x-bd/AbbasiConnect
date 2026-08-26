# AbbasiConnect

AbbasiConnect is a verified, text-only matrimonial platform.

It is deliberately designed without matrimonial profile photos, galleries, video, stories, reels, posts, public walls, follower counts, likes, or social-media feeds.

The only image flow in the product is temporary Aadhaar-card input during identity verification. That image is not a matrimonial profile image and is not stored as profile media.

## Core product idea

```text
Register / Sign in
       |
       v
Verified matrimonial profile
       |
       +--> Browse text profiles
       +--> Search and filter
       +--> Shortlist
       +--> Send interest
       +--> Accept / decline
       +--> Mutual interest
       +--> Contact details unlocked
```

## Registration

```text
Register
  -> upload Aadhaar card image
  -> OCR reads the name
  -> Aadhaar verification adapter verifies identity
  -> short-lived registration proof
  -> create account and matrimonial profile
```

The account creation form collects:

- display name
- username
- password
- email and/or contact number
- date of birth
- gender
- height
- marital status
- education
- occupation
- city, state and country
- languages
- about text
- family details
- interests
- who created the profile, such as self, parent, family or guardian

Passwords are stored only as bcrypt hashes.

Each account is linked one-to-one with the verified identity through a unique internal `identityRefHash`.

## Sign in

Returning users do not repeat Aadhaar onboarding.

```text
Sign in
  -> username
  -> password
  -> session
```

## Text-only matrimonial profiles

A browse card can contain:

```text
Name
@username
Verified identity
Age
Height
Marital status
Location
Education
Occupation
Short about section
```

There is no profile-photo field or profile-image component.

A full profile can additionally contain:

- family details
- languages
- interests
- profile-created-by information
- partner preferences
- preferred age range
- preferred height range
- preferred locations
- preferred education
- preferred occupation
- additional preference notes

## Browse and discovery

Profiles can be filtered by:

- text search
- gender
- city
- marital status
- minimum age
- maximum age

The backend also supports height filters.

Paused, suspended and blocked profiles are excluded from normal discovery.

## Interests

Instead of following people, users send matrimonial interests.

```text
Profile A -> Send interest -> Profile B
```

The recipient can:

- accept
- decline

The sender can withdraw a pending interest.

If both sides independently express interest, the existing pending request becomes accepted automatically.

## Mutual interest and contact privacy

Email and phone are private account data.

They are not returned in browse results or normal public profile responses.

Contact details become visible when:

1. the profile is your own account, or
2. an interest between the two profiles has status `ACCEPTED`

```text
No mutual interest
    -> profile details only

Accepted interest
    -> profile details + email/phone
```

## Shortlist

Users can privately shortlist profiles for later review.

Shortlisting is not visible to the shortlisted person.

## Safety

The matrimonial pivot keeps:

- block
- profile reporting
- moderator/admin roles
- moderation queue
- suspend/restore profile actions

Blocking removes outstanding interest and shortlist relationships between the two accounts.

## Data model

The old social models have been removed.

Current primary models:

- `User`
- `MatchInterest`
- `Shortlist`
- `Block`
- `Report`

Current important enums:

- `UserRole`
- `MaritalStatus`
- `InterestStatus`
- `ReportStatus`
- `ReportReason`

There are no `Post`, `Like`, or `Follow` models in the matrimonial schema.

## Architecture

```text
apps/web      React + Vite
apps/api      Fastify + Prisma + Tesseract OCR
PostgreSQL    database

Browser -> API -> PostgreSQL
             |
             +-> temporary Aadhaar OCR
             |
             -> Aadhaar verification adapter
```

## Local setup

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

Generate Prisma and create a fresh database:

```bash
npm run db:generate
npm run db:init
npm run dev
```

Open:

```text
http://localhost:5173
```

## Upgrading an existing development database

The matrimonial pivot removes the old post/follow/like social tables and changes the User model substantially.

For a development database:

```bash
git pull
npm install
npm run db:generate
npm run db:upgrade
npm run dev
```

Because this is still an early development project, resetting the local database and creating fresh matrimonial test accounts may be simpler if Prisma reports migration conflicts caused by old social test data.

## Development Aadhaar flow

Use a test Aadhaar-like image during local development rather than real identity documents.

The OCR layer reads the image in memory and attempts to extract the name.

The current Aadhaar authentication provider is still simulated using a development reference such as:

```text
DEV-ABBASI-001
```

Live UIDAI/Aadhaar-provider integration remains a later step behind the existing verification adapter.

## Current API surface

```text
GET    /health

POST   /auth/dev-aadhaar/scan
POST   /auth/dev-aadhaar/verify
POST   /auth/register
POST   /auth/sign-in
GET    /auth/me

PATCH  /profiles/me
GET    /profiles/browse
GET    /profiles/:username
POST   /profiles/:id/interest
POST   /profiles/:id/shortlist
DELETE /profiles/:id/shortlist
POST   /profiles/:id/block
DELETE /profiles/:id/block

GET    /interests
PATCH  /interests/:id
GET    /shortlist

POST   /reports
GET    /moderation/reports
PATCH  /moderation/reports/:id
```

## Intentionally deferred

- live UIDAI/Aadhaar authentication provider
- email OTP verification
- phone OTP verification
- password recovery
- private messaging after mutual interest
- notifications
- deployment
- mobile clients

The product is now structurally a matrimonial service, not a social-media network.
