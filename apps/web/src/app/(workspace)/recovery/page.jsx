import { SessionRestore } from '@/features/auth/session-provider';
import { getPlanningSession } from '@/features/auth/workspace-gate';
import { PlaceholderPage } from '@/components/placeholder-page';

export const metadata = { title: 'Recovery' };

export default async function RecoveryPage() {
  if (!(await getPlanningSession())) return <SessionRestore embedded />;
  return (
    <PlaceholderPage
      title="Recovery"
      description="Deleted-record recovery and the wedding’s seven-day recovery window will be implemented in a later milestone."
    />
  );
}
