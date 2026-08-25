# AbbasiConnect architecture

## Principle

Build the social product once around a stable HTTP API. The web app is simply the first client. A future Android or iOS app should consume the same API and database rather than duplicating business logic.

## Components

```text
Web client (React/Vite)
        |
        | HTTPS JSON API
        v
Backend API (Fastify)
        |
        +---- Identity adapter
        |
        v
PostgreSQL
```

## Identity

The identity system is behind an adapter boundary. The rest of the application should not know whether the production provider uses an authorized Aadhaar authentication flow, compliant Aadhaar offline e-KYC, or another verification mechanism.

AbbasiConnect creates its own UUID user ID after verification.

Never use a raw Aadhaar number as:

- a primary key
- a username
- a public identifier
- a value included in logs
- a value sent back to the web or future mobile clients after verification

## Phase 1 entities

### User

Verified account identity and public text profile.

### Post

Text only. Maximum 1,000 characters in the starter.

### Follow

Directed social graph edge from one user to another.

## Deliberately excluded from phase 1

- images
- videos
- file uploads
- stories
- reels
- chat
- groups
- recommendation ML
- notifications
- advertising

These can be added after the basic identity, graph, posting, and retention loops work.

## Mobile extension

A future React Native, Expo, Android, or iOS application should call the same endpoints under `/auth`, `/feed`, `/posts`, and `/users`. The PostgreSQL schema remains shared.
