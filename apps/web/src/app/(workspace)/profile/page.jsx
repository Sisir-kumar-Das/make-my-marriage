import { SessionRestore } from '@/features/auth/session-provider';
import { getPlanningSession } from '@/features/auth/workspace-gate';
import { PlaceholderPage } from '@/components/placeholder-page';

export const metadata = { title: 'Profile' };

export default async function ProfilePage() {
  if (!(await getPlanningSession())) return <SessionRestore embedded />;
  return (
    <PlaceholderPage
      title="Profile"
      description="Account details and profile editing will be implemented in a later milestone."
    />
  );
}
