import { SessionRestore } from '@/features/auth/session-provider';
import { getPlanningSession } from '@/features/auth/workspace-gate';
import { TasksPreview } from '@/features/dashboard/planning-previews';

export const metadata = { title: 'Tasks' };

export default async function TasksPage() {
  const session = await getPlanningSession();
  if (!session) return <SessionRestore embedded />;
  return <TasksPreview />;
}
