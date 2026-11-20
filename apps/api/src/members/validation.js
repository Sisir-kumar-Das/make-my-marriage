import { z } from 'zod';
import { ApiError } from '../lib/api-error.js';
import { relationshipChoices } from '../invitations/validation.js';

export const memberRemovalInput = z
  .object({
    preview: z.string().regex(/^\d{13}\.[a-f\d]{64}$/),
    policy: z.enum(['REASSIGN', 'UNASSIGN']).nullable(),
    replacementUserId: z
      .string()
      .regex(/^[a-f\d]{24}$/)
      .nullable()
      .default(null),
    handoverToUserId: z
      .string()
      .regex(/^[a-f\d]{24}$/)
      .nullable()
      .default(null),
    confirmHandover: z.boolean().default(false),
    confirmRemoval: z.literal(true),
  })
  .strict()
  .superRefine((input, ctx) => {
    if ((input.policy === 'REASSIGN') !== !!input.replacementUserId)
      ctx.addIssue({
        code: 'custom',
        path: ['replacementUserId'],
        message: 'Reassignment requires a recipient; unassignment has none.',
      });
    if (input.confirmHandover !== !!input.handoverToUserId)
      ctx.addIssue({
        code: 'custom',
        path: ['handoverToUserId'],
        message: 'Confirm a selected repeat manager.',
      });
  });

export const memberChangeInput = z
  .object({
    role: z.enum(['ADMIN', 'FAMILY_MEMBER', 'VIEWER']),
    relationshipChoice: z.enum(['', ...relationshipChoices, 'OTHER']),
    customRelationship: z.string().trim().max(80).default(''),
    preview: z.string().regex(/^\d{13}\.[a-f\d]{64}$/),
    handoverToUserId: z
      .string()
      .regex(/^[a-f\d]{24}$/)
      .nullable()
      .default(null),
    confirmHandover: z.boolean().default(false),
  })
  .strict();

export function memberVersion(value) {
  if (value === undefined)
    throw new ApiError(
      428,
      'PRECONDITION_REQUIRED',
      'Reload the member before saving.',
    );
  if (
    typeof value !== 'string' ||
    !/^"?\d{1,15}"?$/.test(value) ||
    value.startsWith('"') !== value.endsWith('"')
  )
    throw new ApiError(400, 'VALIDATION_ERROR', 'Use a valid member version.');
  return Number(value.replaceAll('"', ''));
}

export function memberRelationship(input, isCreator) {
  if (isCreator) {
    if (input.relationshipChoice || input.customRelationship)
      throw new ApiError(
        400,
        'VALIDATION_ERROR',
        'The original wedding creator is exempt from relationship labels.',
      );
    return null;
  }
  if (
    !input.relationshipChoice ||
    (input.relationshipChoice === 'OTHER' && !input.customRelationship)
  )
    throw new ApiError(
      400,
      'VALIDATION_ERROR',
      'Choose a relationship, or specify it after choosing Other.',
    );
  return input.relationshipChoice === 'OTHER'
    ? input.customRelationship
    : input.relationshipChoice;
}
