import { SessionRestore } from '@/features/auth/session-provider';
import { getWorkspaceSession } from '@/features/auth/workspace-gate';
import { PlaceholderPage } from '@/components/placeholder-page';

export const metadata = { title: 'Checklist' };

export default async function ChecklistPage() {
  if (!(await getWorkspaceSession())) return <SessionRestore embedded />;
  return (
    <PlaceholderPage
      title="Checklist"
      description="Explicit, duplicate-safe checklist generation will be implemented in a later milestone."
    />
  );
}
