import { z } from "zod";

export const devIdentitySchema = z.object({
  displayName: z.string().trim().min(2).max(80),
  reference: z.string().trim().min(4).max(100),
});
