# AbbasiConnect MVP product scope

## Core idea

A verified-human, text-only social network with extremely low onboarding friction and no photo or video layer.

## First user journey

1. User arrives at AbbasiConnect.
2. User completes identity verification.
3. Backend creates or finds the AbbasiConnect account associated with that verified identity.
4. User enters the text feed.
5. User can write a post.
6. User can open another member profile.
7. User can follow or unfollow that member.
8. Future visits reuse an AbbasiConnect session or another low-friction sign-in mechanism.

## First screens

### 1. Identity entry

One clear verification action. The development build currently simulates the verified identity handoff.

### 2. Feed

Reverse-chronological text feed in the first build.

### 3. Composer

Plain text, maximum 1,000 characters.

### 4. Profile

- display name
- username
- short bio
- follower count
- following count
- posts

## What to add after the starter works

Priority order:

1. username editing during onboarding
2. member search
3. replies
4. likes
5. reports and moderation queue
6. blocks and mutes
7. notification inbox
8. feed ranking only after enough usage data exists
9. private messages only if users actually need them
10. mobile app

## Why web first

The web client lets the product and API be tested rapidly. Since identity, feed, posts, profiles, and social graph logic live in the backend, a later mobile application becomes another client rather than a separate product rebuild.
