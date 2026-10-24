import { SessionRestore } from '@/features/auth/session-provider';
import { getPlanningSession } from '@/features/auth/workspace-gate';
import { EventsPage as EventWorkspace } from '@/features/events/events-page';

export const metadata = { title: 'Events' };

export default async function EventsPage({ searchParams }) {
  const session = await getPlanningSession();
  if (!session) return <SessionRestore embedded />;
  const { create } = await searchParams;
  return <EventWorkspace openCreate={create === '1'} />;
}
