export const roleLabels = {
  ADMIN: 'Admin',
  FAMILY_MEMBER: 'Family Member',
  VIEWER: 'Viewer',
};
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
export const validInvitationToken = (value) =>
  typeof value === 'string' && /^[A-Za-z0-9_-]{43}$/.test(value);
export function readInvitation(hash, name = 'invite') {
  const params = new URLSearchParams((hash || '').replace(/^#/, ''));
  const values = params.getAll(name);
  return values.length === 1 && validInvitationToken(values[0])
    ? values[0]
    : '';
}
export function invitationAuthHref(path, token) {
  if (
    ![
      '/login',
      '/login?from=registration',
      '/register',
      '/register?from=login',
    ].includes(path)
  )
    return '/login';
  return validInvitationToken(token) ? `${path}#invite=${token}` : path;
}
export const invitationHref = (token) =>
  validInvitationToken(token) ? `/invite#token=${token}` : '/invite';
