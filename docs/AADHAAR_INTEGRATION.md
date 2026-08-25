# Aadhaar onboarding and integration boundary

AbbasiConnect now models the intended onboarding UX and performs real OCR extraction, while keeping UIDAI-backed Aadhaar authentication behind a replaceable identity adapter.

## Intended user flow

```text
1. User chooses/takes a photo of Aadhaar
2. OCR reads the card
3. Likely name is extracted
4. Extracted name is shown to the user
5. User can edit the public display name
6. User chooses an AbbasiConnect username
7. Aadhaar identity is verified
8. Backend receives a verified provider reference
9. AbbasiConnect creates/finds the internal User
10. AbbasiConnect issues its own session
11. Card image is discarded
```

The Aadhaar card itself is an onboarding input, not a profile photo and not a permanent social-media asset.

## Development implementation

The web app includes the two-step onboarding screen:

- upload a test card image
- backend reads the image with Tesseract.js OCR
- a likely English name is extracted from the OCR text
- user reviews/edits the detected name
- user chooses a username
- user supplies a development verification reference
- account is registered

`POST /auth/dev-aadhaar/scan` accepts the temporary image as a data URL. The backend OCR worker processes it in memory and returns only the extracted display-name candidate and OCR confidence. The image is not written to PostgreSQL.

`POST /auth/dev-aadhaar` turns the development verification reference into a one-way identity hash and creates or retrieves the account.

The development reference is the remaining simulation. It stands in for the provider reference that a real Aadhaar verification integration would return.

## Production extraction and verification

OCR is useful for quickly populating user-facing fields, but OCR text by itself does not prove an Aadhaar document is genuine.

The production pipeline should therefore evolve toward:

```text
card image / offline Aadhaar data
        |
        +--> OCR for user-facing field extraction
        |
        +--> Aadhaar secure QR or digitally signed offline e-KYC verification
        |
        +--> authorized online Aadhaar authentication when configured
        |
        v
VerifiedIdentity
```

UIDAI's Paperless Offline e-KYC contains digitally signed demographic data and a reference rather than requiring the service provider to store the full Aadhaar number. That is a stronger verification source than OCR alone.

## Data handling boundary

The social database should contain only what AbbasiConnect needs after verification:

- internal user UUID
- one-way identity reference hash
- optional last four digits/reference fragment when justified
- public display name
- username
- bio
- verification timestamp

It should not use the raw Aadhaar number as the user ID.

The uploaded Aadhaar image is not part of the social-media data model and should remain temporary.

## Production adapter contract

A real identity provider should normalize to something like:

```ts
type VerifiedIdentity = {
  verified: true;
  provider: "aadhaar-online" | "aadhaar-offline-ekyc" | "aadhaar-secure-qr";
  identityReference: string;
  verifiedName: string;
  aadhaarLast4?: string;
};
```

The backend then:

1. hashes `identityReference`
2. finds or creates the corresponding `User`
3. records `verifiedAt`
4. issues an AbbasiConnect session token
5. deletes/discards temporary identity-upload material

Everything after that point uses the AbbasiConnect UUID rather than Aadhaar credentials.

## Return login

Aadhaar verification is primarily the identity-establishment event. After registration, ordinary visits use the AbbasiConnect session. A future login design can add device-bound sessions, passkeys, or another low-friction re-authentication path while preserving the verified identity established during onboarding.
