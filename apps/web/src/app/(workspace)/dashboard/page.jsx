import { SessionRestore } from '@/features/auth/session-provider';
import { getWorkspaceSession } from '@/features/auth/workspace-gate';
import { Dashboard } from '@/features/dashboard/dashboard';

export const metadata = { title: 'Dashboard' };

export default async function DashboardPage() {
  if (!(await getWorkspaceSession())) return <SessionRestore embedded />;
  return <Dashboard />;
}
