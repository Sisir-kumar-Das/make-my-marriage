import { SessionRestore } from '@/features/auth/session-provider';
import { getPlanningSession } from '@/features/auth/workspace-gate';
import { PlaceholderPage } from '@/components/placeholder-page';

export const metadata = { title: 'Events' };

export default async function EventsPage() {
  if (!(await getPlanningSession())) return <SessionRestore embedded />;
  return (
    <PlaceholderPage
      title="Events"
      description="Ceremonies, venues and event activities will be implemented in a later milestone."
    />
  );
}
