import { SessionRestore } from '@/features/auth/session-provider';
import { getPlanningSession } from '@/features/auth/workspace-gate';
import { EventsPreview } from '@/features/dashboard/planning-previews';

export const metadata = { title: 'Events' };

export default async function EventsPage() {
  const session = await getPlanningSession();
  if (!session) return <SessionRestore embedded />;
  return <EventsPreview />;
}
