import { redirect } from 'next/navigation';
import { getWorkspaceSession } from '@/features/auth/workspace-gate';
import { SessionRestore } from '@/features/auth/session-provider';
import { WeddingRecovery } from '@/features/weddings/wedding-lifecycle';
export const metadata = {
  title: 'Wedding recovery',
  robots: { index: false, follow: false },
};
export default async function RecoveryPage() {
  const session = await getWorkspaceSession();
  if (!session) return <SessionRestore />;
  if (!session.recovery)
    redirect(session.wedding ? '/dashboard' : '/wedding-setup');
  return <WeddingRecovery session={session} />;
}
