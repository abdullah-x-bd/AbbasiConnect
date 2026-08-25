# Aadhaar onboarding and integration boundary

AbbasiConnect now models the intended onboarding UX while keeping real Aadhaar authentication behind a replaceable identity adapter.

## Intended user flow

```text
1. User chooses/takes a photo of Aadhaar
2. Identity adapter reads the card
3. Extracted name is shown to the user
4. User can edit the public display name
5. User chooses an AbbasiConnect username
6. Aadhaar identity is verified
7. Backend receives a verified provider reference
8. AbbasiConnect creates/finds the internal User
9. AbbasiConnect issues its own session
10. Card image is discarded
```

The Aadhaar card itself is an onboarding input, not a profile photo and not a permanent social-media asset.

## Development implementation

The web app includes the complete two-step onboarding screen:

- upload a test card image
- review/edit the detected-name field
- choose a username
- provide a development verification reference
- register the account

`POST /auth/dev-aadhaar/scan` accepts the temporary test image as a data URL and returns simulated extraction output. The development adapter does not persist the uploaded image.

`POST /auth/dev-aadhaar` turns the development verification reference into a one-way identity hash and creates or retrieves the account.

Do not use a real Aadhaar card or real Aadhaar number with the development endpoints.

## Production extraction

The production adapter should not treat OCR text alone as proof that the Aadhaar document is authentic.

A practical production pipeline is:

```text
card image / offline Aadhaar data
        |
        +--> OCR for user-facing field extraction
        |
        +--> Aadhaar QR or digitally signed offline e-KYC verification where available
        |
        +--> authorized online Aadhaar authentication when configured
        |
        v
VerifiedIdentity
```

OCR can populate fields such as the person's name so the onboarding form feels instant. Verification should be performed through an Aadhaar verification mechanism rather than trusting the OCR output itself.

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

The normal target is also not to retain the uploaded Aadhaar card image after verification.

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

Aadhaar verification is primarily the identity-establishment event. After registration, ordinary visits should use the AbbasiConnect session. A future login design can add device-bound sessions, passkeys, or another low-friction re-authentication path while preserving the verified identity established during onboarding.
