import { SessionRestore } from '@/features/auth/session-provider';
import { getPlanningSession } from '@/features/auth/workspace-gate';
import { PlaceholderPage } from '@/components/placeholder-page';

export const metadata = { title: 'Members' };

export default async function MembersPage() {
  if (!(await getPlanningSession())) return <SessionRestore embedded />;
  return (
    <PlaceholderPage
      title="Members"
      description="Member invitations and Admin, Family Member and Viewer roles will be implemented in a later milestone."
    />
  );
}
