import { z } from 'zod';

/** The signed-in person, as Donovan knows them. Created on first sign-in from the identity provider's claims. */
export const Me = z.object({
  id: z.uuid(),
  name: z.string(),
  firstName: z.string(),
  email: z.email().nullable(),
  initials: z.string().max(3),
});
export type Me = z.infer<typeof Me>;
