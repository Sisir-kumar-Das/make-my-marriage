import { SessionRestore } from '@/features/auth/session-provider';
import { getPlanningSession } from '@/features/auth/workspace-gate';
import { RecoveryPreview } from '@/features/dashboard/planning-previews';

export const metadata = { title: 'Recovery' };

export default async function RecoveryPage() {
  const session = await getPlanningSession();
  if (!session) return <SessionRestore embedded />;
  return <RecoveryPreview />;
}
