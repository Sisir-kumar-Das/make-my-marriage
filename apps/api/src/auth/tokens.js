import { createHash, randomBytes } from 'node:crypto';

export const hashToken = (token) =>
  createHash('sha256').update(token).digest('hex');
export const generateToken = () => randomBytes(32).toString('base64url');
