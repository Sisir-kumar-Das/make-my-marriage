import { SessionRestore } from '@/features/auth/session-provider';
import { getPlanningSession } from '@/features/auth/workspace-gate';
import { MembersPreview } from '@/features/dashboard/planning-previews';

export const metadata = { title: 'Members' };

export default async function MembersPage() {
  const session = await getPlanningSession();
  if (!session) return <SessionRestore embedded />;
  return <MembersPreview session={session} />;
}
