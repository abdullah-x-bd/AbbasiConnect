export type AuthTokenPayload = {
  userId: string;
  kind?: "registration";
  scope?: "admin" | "abc_draft" | "abc_member" | "abc_enrichment_preview";
  abcNonce?: string;
  registrationId?: string;
  path?: string;
  value?: unknown;
  version?: number;
  identityRefHash?: string;
  identityName?: string;
  identityLast4?: string;
};
