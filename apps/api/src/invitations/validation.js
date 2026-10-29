import { z } from 'zod';
import { emailSchema } from '../auth/validation.js';
export const relationshipChoices = [
  'Bride’s father',
  'Bride’s mother',
  'Bride’s brother',
  'Bride’s sister',
  'Groom’s father',
  'Groom’s mother',
  'Groom’s brother',
  'Groom’s sister',
  'Friend',
  'Planner',
];
export const tokenSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/);
export const invitationInput = z
  .object({
    email: emailSchema,
    role: z.enum(['ADMIN', 'FAMILY_MEMBER', 'VIEWER']),
    relationshipChoice: z.enum([...relationshipChoices, 'OTHER']),
    customRelationship: z.string().trim().max(80).default(''),
  })
  .strict()
  .superRefine((input, ctx) => {
    if (input.relationshipChoice === 'OTHER' && !input.customRelationship)
      ctx.addIssue({
        code: 'custom',
        path: ['customRelationship'],
        message: 'Specify the relationship.',
      });
  });
export const invitationChange = z
  .object({
    version: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  })
  .strict();
export const invitationTokenInput = z.object({ token: tokenSchema }).strict();
export const invitationPage = z
  .object({
    page: z
      .string()
      .regex(/^[1-9]\d{0,5}$/)
      .transform(Number)
      .pipe(z.number().max(100000))
      .default(1),
  })
  .strict();
