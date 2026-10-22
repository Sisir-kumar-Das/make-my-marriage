import { SessionRestore } from '@/features/auth/session-provider';
import { getPlanningSession } from '@/features/auth/workspace-gate';
import { PlaceholderPage } from '@/components/placeholder-page';

export const metadata = { title: 'Checklist' };

export default async function ChecklistPage() {
  if (!(await getPlanningSession())) return <SessionRestore embedded />;
  return (
    <PlaceholderPage
      title="Checklist"
      description="Explicit, duplicate-safe checklist generation will be implemented in a later milestone."
    />
  );
}
