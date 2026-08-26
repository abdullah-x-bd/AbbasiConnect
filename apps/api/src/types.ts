export type AuthTokenPayload = {
  userId: string;
  kind?: "registration";
  scope?: "admin";
  identityRefHash?: string;
  identityName?: string;
  identityLast4?: string;
};
