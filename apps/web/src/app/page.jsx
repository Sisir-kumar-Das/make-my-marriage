import { Homepage } from '@/features/home/homepage';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { getWorkspaceSession } from '@/features/auth/workspace-gate';
import { HomeEntry } from '@/features/auth/home-entry';

export const metadata = {
  title: {
    absolute: 'Make My Marriage — Plan every moment. Enjoy every memory.',
  },
  description:
    'Bring your wedding events, tasks and family together in one beautifully organized place. Explore the Make My Marriage product preview.',
};

export default async function HomePage() {
  const jar = await cookies();
  const mayHaveSession = [
    'mmm_access',
    '__Host-mmm_access',
    'mmm_csrf_context',
    '__Host-mmm_csrf_context',
  ].some((name) => !!jar.get(name)?.value);
  if (!mayHaveSession) return <Homepage />;

  const session = await getWorkspaceSession();
  if (session) redirect(session.wedding ? '/dashboard' : '/wedding-setup');
  // Refresh cookies remain scoped to /api/v1/auth, so restore through the browser relay.
  return (
    <HomeEntry>
      <Homepage />
    </HomeEntry>
  );
}
