import { createHash, createHmac, randomBytes } from 'node:crypto';
import { ApiError } from '../lib/api-error.js';
export const hashInvitation = (value) =>
  createHash('sha256').update(value).digest('hex');
export function invitationToken(settings, id, nonce) {
  if (typeof settings.jwtSecret !== 'string' || settings.jwtSecret.length < 32)
    throw new ApiError(
      503,
      'INVITATION_UNAVAILABLE',
      'Invitations are temporarily unavailable.',
    );
  return createHmac('sha256', settings.jwtSecret)
    .update(`mmm:member-invitation:v1:${id}:${nonce}`)
    .digest('base64url');
}
export function newInvitationToken(settings, id) {
  const nonce = randomBytes(32).toString('base64url');
  const token = invitationToken(settings, id, nonce);
  return { nonce, tokenHash: hashInvitation(token) };
}
export function invitationUrl(webOrigin, token) {
  const url = new URL('/invite', webOrigin);
  url.hash = new URLSearchParams({ token }).toString();
  return url.href;
}
