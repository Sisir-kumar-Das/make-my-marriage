import { getWorkspaceSession } from '@/features/auth/workspace-gate';
import { SessionRestore } from '@/features/auth/session-provider';
import { MyInvitations } from '@/features/invitations/my-invitations';

export const metadata = {
  title: 'My Invitations',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
};
export default async function InvitationsPage() {
  const session = await getWorkspaceSession();
  if (!session) return <SessionRestore />;
  return <MyInvitations key={session.user.id} initialSession={session} />;
}
