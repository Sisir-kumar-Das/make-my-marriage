import { SessionRestore } from '@/features/auth/session-provider';
import { getPlanningSession } from '@/features/auth/workspace-gate';
import { WeddingActivity } from '@/features/dashboard/wedding-activity';

export const metadata = { title: 'Wedding Activity' };

export default async function ActivityPage({ searchParams }) {
  const session = await getPlanningSession();
  if (!session) return <SessionRestore embedded />;
  const { page } = await searchParams;
  return (
    <WeddingActivity
      weddingId={session.wedding.id}
      userId={session.user.id}
      page={
        typeof page === 'string' && /^[1-9]\d{0,5}$/.test(page)
          ? Number(page)
          : 1
      }
    />
  );
}
