# AbbasiConnect

AbbasiConnect is a text-first community platform built around verified people and family relationships.

The current product has four primary modules:

1. **Rishte**
2. **Family Tree**
3. **Community**
4. **Messages**

There are no profile photographs, avatars, galleries or media posts in the current product.

## Product model

A person creates one AbbasiConnect account. That account can participate in the wider community, build and verify family relationships, optionally appear in Rishte, post text updates and privately message other registered members.

### Registration

Registration currently uses a development OTP adapter.

The user enters a phone number or email address, requests an OTP and completes registration with the six-digit code. In development, the OTP is shown directly in the interface. The backend is structured so that this adapter can later be replaced by WhatsApp OTP, SMS OTP or email OTP without changing the account model.

Aadhaar is **optional**. It is not required for registration. The optional development Aadhaar route stores only a hash/reference plus optional metadata. No Aadhaar card image is stored.

### Family Tree

A registered user can add a relative even if that relative has not registered yet.

Example:

```text
Abdullah adds Hamzah as Brother
        ↓
AbbasiConnect creates a family code
        ↓
Hamzah later registers
        ↓
Hamzah enters that family code
        ↓
The family relationship becomes VERIFIED
```

Verified family links form a graph rather than isolated profile fields. This means connected relatives can become part of the same extended family network.

A family link can currently be:

- Parent
- Child
- Sibling
- Spouse
- Other

Unregistered relatives can remain visible as named nodes in the account owner's family tree until they claim the relationship.

### Family-tree privacy

Family trees are not automatically visible to every registered user.

A member can find another member in the community directory and send a tree-access request. The tree owner can approve or decline the request. Only an approved requester can load that member's connected family graph.

### Rishte

Rishte is opt-in.

A normal account is not automatically listed. A user chooses whether to activate a Rishte profile and can add:

- headline
- introduction
- family note
- what they are looking for

Rishte remains text-only.

Members can send an interest. The recipient can accept or decline it. Mutual interest is tracked separately from general community membership.

### Community

Community is a text-only public board for registered members.

Members can publish text posts and delete their own posts. Media uploads are intentionally not part of the current implementation.

### Messages

Registered members can start private one-to-one message threads with other discoverable community members.

The backend stores threads and messages separately, supports read timestamps and prevents access to threads by non-participants.

## Administration

Members and administrators use the same visible sign-in screen.

Development admin credentials:

```text
username: admin
password: AbbasiAdmin123!
```

An admin credential receives an admin-scoped JWT and is routed to `/admin` inside the same web application. The admin is not represented as a fake community or Rishte profile.

The current admin overview includes:

- registered members
- new registrations
- active Rishte profiles
- family links
- verified family links
- pending family-tree access requests
- community posts
- direct messages
- Rishte interests
- reports

The member-management view also shows contact verification, optional Aadhaar status, Rishte participation, directory visibility, family-link count, post count and message count.

## Demo users

Run the seed command to create two connected demo accounts:

```text
abdullah_test
TestUser123!

hamzah_test
TestUser123!
```

The seed also creates:

- a verified sibling relationship between the two users
- an active Rishte profile for `hamzah_test`
- a community post
- a private message thread and demo message

The seed is idempotent and can be run again safely.

## Run in GitHub Codespaces

No local Node or Docker installation is required if you use GitHub Codespaces.

Open the repository in a Codespace. The dev container provides Node 22 and Docker.

Then run:

```bash
npm run demo:setup
npm run dev
```

Open forwarded port `5173`.

`demo:setup` performs:

```text
start PostgreSQL
→ generate Prisma client
→ push the current schema
→ seed demo users/data
```

If the Codespace was created before the latest changes, run:

```bash
git pull
npm install
npm run demo:setup
npm run dev
```

## Architecture

```text
Browser
  |
  | port 5173
  v
React + Vite web app
  |
  | /api proxy
  v
Fastify API, port 3001
  |
  v
PostgreSQL
```

The API handles member and admin authentication in one service.

Core PostgreSQL models include:

```text
User
OtpChallenge
FamilyLink
FamilyTreeAccess
RishteProfile
MatchInterest
Post
DirectThread
Message
Block
Report
```

## Current API groups

### Authentication

```text
POST  /auth/request-otp
POST  /auth/register
POST  /auth/sign-in
GET   /auth/session
GET   /auth/me
PATCH /auth/me
```

### Optional identity

```text
POST /identity/aadhaar-dev
```

### Community directory

```text
GET /directory
```

### Family

```text
POST  /family/members
POST  /family/claim
GET   /family/me
POST  /family/access/:targetId
PATCH /family/access/:id
GET   /family/tree/:userId
```

### Rishte

```text
GET   /rishte
GET   /rishte/me
PUT   /rishte/me
POST  /rishte/:userId/interest
GET   /rishte/interests
PATCH /rishte/interests/:id
```

### Community

```text
GET    /community/posts
POST   /community/posts
DELETE /community/posts/:id
```

### Messages

```text
POST /messages/threads/:userId
GET  /messages/threads
GET  /messages/threads/:id
POST /messages/threads/:id/messages
```

### Administration

```text
GET   /admin/overview
GET   /admin/users
PATCH /admin/users/:id
GET   /admin/reports
PATCH /admin/reports/:id
```

## GitHub hosting versus production hosting

GitHub stores the source code and Codespaces can run the complete stack for development and demonstrations.

A Codespace is not intended to be the permanent public deployment. Multiple testers can use a running shared Codespace URL if port visibility is configured appropriately, but the Codespace can stop and its database belongs to that environment.

For a real always-on multi-user deployment, the same codebase should be deployed with:

- a persistent PostgreSQL service
- an always-on API/web host
- production secrets
- a real OTP provider
- HTTPS and a custom domain

No architectural rewrite should be required for that transition.

## Production work still required

This repository is a functional development implementation, not a production-ready identity platform.

Before public launch, add or complete:

- real WhatsApp/SMS/email OTP provider
- OTP rate limits and abuse controls
- password recovery
- session revocation and stronger token storage
- production secret management
- CSRF strategy if moving auth to cookies
- security headers
- audit logging for admin actions
- database backups
- data-retention policy
- privacy policy and consent flows for family data
- stronger family-link dispute/revocation workflows
- notification delivery
- deployment health checks and monitoring
- automated integration tests against PostgreSQL
- dependency security remediation

Aadhaar should only be integrated through an appropriate compliant verification flow after the legal, security and provider architecture is finalized.
