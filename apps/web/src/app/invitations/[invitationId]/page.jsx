import { notFound } from 'next/navigation';
import { getWorkspaceSession } from '@/features/auth/workspace-gate';
import { SessionRestore } from '@/features/auth/session-provider';
import { AcceptInvitation } from '@/features/invitations/accept-invitation';

export const metadata = {
  title: 'Review invitation',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
};
export default async function InvitationPage({ params }) {
  const { invitationId } = await params;
  if (!/^[a-f\d]{24}$/.test(invitationId)) notFound();
  const session = await getWorkspaceSession();
  if (!session) return <SessionRestore />;
  return <AcceptInvitation key={session.user.id} invitationId={invitationId} />;
}
