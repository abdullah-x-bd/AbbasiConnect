# Identity adapter boundary

The API currently exposes a development-only simulated Aadhaar verification endpoint so the rest of the application can be built and tested without collecting real Aadhaar data.

Production integration should replace the simulator with one of these backend-only adapters:

- authorized online Aadhaar authentication through an applicable AUA/Sub-AUA setup
- Aadhaar Paperless Offline e-KYC verification

The adapter should return only the minimum internal result needed by AbbasiConnect, for example:

```ts
{
  verified: true,
  identityReference: "provider-generated-reference",
  displayName: "Verified name"
}
```

The application then hashes `identityReference` and stores the hash as its uniqueness key. Do not make a raw Aadhaar number the application user ID.
