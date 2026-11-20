import { SessionRestore } from '@/features/auth/session-provider';
import { getPlanningSession } from '@/features/auth/workspace-gate';
import { ChecklistCatalog } from '@/features/checklist/checklist-catalog';

export const metadata = { title: 'Checklist' };

export default async function ChecklistPage() {
  const session = await getPlanningSession();
  if (!session) return <SessionRestore embedded />;
  return <ChecklistCatalog />;
}
