# Aadhaar integration boundary

The starter intentionally does not send real Aadhaar authentication requests. It provides a development simulator so product development can continue independently from production identity-provider onboarding.

## Production design

```text
Browser or mobile app
        |
        v
AbbasiConnect backend
        |
        v
Identity adapter
        |
        +--> Authorized online Aadhaar integration
        |
        +--> or compliant Aadhaar Paperless Offline e-KYC verification
```

After successful verification, the adapter should return an internal provider reference and the minimum verified attributes needed for account creation.

AbbasiConnect then:

1. converts the provider reference into an application-side one-way identity hash
2. finds or creates the corresponding `User`
3. issues an AbbasiConnect session/token
4. uses the AbbasiConnect UUID for all normal application activity

## Development

The current `/auth/dev-aadhaar` endpoint accepts a fake development reference so the full flow can be tested without sending real identity data.

Example:

```json
{
  "displayName": "Test User",
  "reference": "DEV-ABBASI-001"
}
```

Do not use real Aadhaar numbers with this endpoint.

## Production adapter contract

A future provider can be normalized to an internal result similar to:

```ts
type VerifiedIdentity = {
  verified: true;
  provider: "aadhaar-online" | "aadhaar-offline-ekyc";
  identityReference: string;
  displayName: string;
};
```

The rest of the social application does not need to change when the development provider is replaced.
