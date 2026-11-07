# AbbasiConnect Android and iOS client

This is a React Native and Expo SDK 58 application living alongside the existing web and API workspaces. It consumes the SAME Fastify HTTP endpoints and PostgreSQL database. It does not create a second identity or backend.

## Feature coverage

- Sign in, register, test OTP and session restoration
- Home summary, community feed, posts, JPEG images, likes, comments, share
- Family network graph, relatives and invitation codes, claim, search, permissions, approve/decline/revoke
- Rishte browse/filter, manage listing, send and act on interests
- Direct messaging threads using the web app's RSA-OAEP + AES-GCM encrypted message format
- Profile details, photo upload/removal, directory visibility, development Aadhaar reference
- Admin overview, user suspension, account restoration and reports
- Android APK and iOS build configuration

## Requirements and local setup

Node.js 22.13+ and an Android environment or EAS account.

1. In repository root: npm install
2. Copy apps/mobile/.env.example to apps/mobile/.env
3. Set EXPO_PUBLIC_API_URL to the actual HTTPS origin of the deployed AbbasiConnect API, without a /api suffix. It is a PUBLIC build-time variable, not a secret.
4. From apps/mobile, run npx expo install --check. Use npx expo install --fix if your installed Expo patch suggests supported version adjustments.
5. In root: npm run typecheck -w @abbasiconnect/mobile
6. In root: node apps/mobile/tests/contracts.test.mjs
7. In root: npm run start -w @abbasiconnect/mobile

Important: native WebCrypto requires react-native-quick-crypto with its Nitro native module. Use an Expo development build. Expo Go does not load that custom native module.

Local Android development build: npm run android -w @abbasiconnect/mobile (requires Android Studio / SDK). Or from apps/mobile, run npx eas-cli build --platform android --profile development and install that build.

## Installable Android APK

1. From apps/mobile, log in with npx eas-cli login
2. Configure the EAS build environment value EXPO_PUBLIC_API_URL (real backend HTTPS URL)
3. Run npx eas-cli build --platform android --profile preview
4. Install the APK from the EAS job. The production profile produces an AAB instead.

EAS first-time project configuration and account access may be requested interactively. This repository does not contain a generated APK.

## Mobile plus web interoperability test matrix

- Register two test accounts with the current development OTP.
- Sign in and verify the backend session restores after killing and reopening the mobile app.
- Add and claim family links, request and approve private-tree access, revoke permissions.
- Create, edit, pause and delete Rishte listings. Test pending, accepted, declined and withdrawn interests.
- Publish text and JPEG posts, like/unlike, comment/delete, upload and remove profile photo.
- Send encrypted messages from mobile to web, then web to mobile. Confirm both endpoints decrypt old and new messages. Repeat after sign-in, app restart and password unlock.
- Test chat with a recipient whose encryption keys have not yet been configured.
- Test Android background/resume, airplane mode, retries, smaller screens and navigation.
- Exercise admin actions only with a test administrator.

## Important limitations inherited from the current API

- OTP is for development: the backend returns the code directly instead of actually delivering email or SMS.
- Aadhaar linking uses a simulated developer reference rather than UIDAI verification.
- Messages are encrypted client-side but lack independently verified contact keys and forward secrecy; audit before strong privacy claims.
- Background push notifications are not configured. Messages refresh when the app is active.
- The backend gateway broadcasts events broadly; mobile uses active-screen polling instead.
- Media lives in PostgreSQL as Base64 data URLs and has a strict payload size limit.
- Full native build, physical-device integration, encryption interoperability, and store review have not been verified by this source-only contribution.

## Files

src/api.ts holds the shared HTTP interface and native SecureStore session tokens.
src/crypto.ts implements the browser-compatible key and message format.
src/components/FamilyGraph.tsx visualizes connected members.
src/screens contains native screens for the major features.
eas.json defines development, Android preview APK, and production builds.

Existing apps/web and apps/api code has been left unchanged.
