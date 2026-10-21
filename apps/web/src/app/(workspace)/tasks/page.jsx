import { SessionRestore } from '@/features/auth/session-provider';
import { getWorkspaceSession } from '@/features/auth/workspace-gate';
import { PlaceholderPage } from '@/components/placeholder-page';

export const metadata = { title: 'Tasks' };

export default async function TasksPage() {
  if (!(await getWorkspaceSession())) return <SessionRestore embedded />;
  return (
    <PlaceholderPage
      title="Tasks"
      description="Task creation, assignment, filtering and recurrence will be implemented in a later milestone."
    />
  );
}
