import { SessionRestore } from '@/features/auth/session-provider';
import { getPlanningSession } from '@/features/auth/workspace-gate';
import { TasksPage as TaskPlanner } from '@/features/tasks/tasks-page';

export const metadata = { title: 'Tasks' };

export default async function TasksPage() {
  const session = await getPlanningSession();
  if (!session) return <SessionRestore embedded />;
  return <TaskPlanner />;
}
