export type AuthTokenPayload = {
  userId: string;
  kind?: "registration";
  scope?: "admin" | "abc_draft" | "abc_member";
  abcNonce?: string;
  identityRefHash?: string;
  identityName?: string;
  identityLast4?: string;
};
