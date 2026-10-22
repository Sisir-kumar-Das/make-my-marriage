import { SessionRestore } from '@/features/auth/session-provider';
import { getPlanningSession } from '@/features/auth/workspace-gate';
import { Dashboard } from '@/features/dashboard/dashboard';

export const metadata = { title: 'Dashboard' };

export default async function DashboardPage() {
  const session = await getPlanningSession();
  if (!session) return <SessionRestore embedded />;
  return (
    <Dashboard wedding={session.wedding} membership={session.membership} />
  );
}
