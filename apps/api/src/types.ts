export type AuthTokenPayload = {
  userId: string;
  kind?: "registration";
  identityRefHash?: string;
  identityName?: string;
  identityLast4?: string;
};
