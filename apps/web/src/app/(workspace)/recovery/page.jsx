import { SessionRestore } from '@/features/auth/session-provider';
import { getPlanningSession } from '@/features/auth/workspace-gate';
import { EventRecovery } from '@/features/recovery/event-recovery';

export const metadata = { title: 'Recovery' };

export default async function RecoveryPage() {
  const session = await getPlanningSession();
  if (!session) return <SessionRestore embedded />;
  return <EventRecovery />;
}
